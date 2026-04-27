import { DeepgramClient } from "@deepgram/sdk";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { SttProviderPort, SttStreamPort } from "@/domain/ports/stt-provider-port";
import { Transcript } from "@/domain/value-objects/transcript";
import { env } from "@/config/env";
import { logger } from "@/shared/logger";

type V1Socket = Awaited<ReturnType<DeepgramClient["listen"]["v1"]["connect"]>>;

const WS_OPEN = 1;

/**
 * Replacement for V1Socket.waitForOpen() which only listens for "open" and "error".
 * If the socket is already CLOSED (readyState=3) when called — e.g. auth rejected,
 * immediate network failure — waitForOpen() hangs forever. This version also races
 * against the "close" event so we always resolve or reject.
 */
const waitForOpenOrFail = (conn: V1Socket): Promise<void> => {
  if (conn.readyState === WS_OPEN) return Promise.resolve();

  // Do NOT reject immediately on readyState=3 (CLOSED).
  // The SDK uses startClosed=true — conn.connect() was just called and the actual
  // WebSocket is created asynchronously (setTimeout). Just listen for events;
  // connectionTimeoutInSeconds handles the "never opens" case.
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      conn.socket.removeEventListener("open", onOpen);
      conn.socket.removeEventListener("close", onClose);
      conn.socket.removeEventListener("error", onError);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onClose = (e: unknown) => {
      cleanup();
      reject(new Error(`Deepgram WS closed before opening (code=${(e as CloseEvent).code})`));
    };
    const onError = (e: unknown) => {
      cleanup();
      reject(new Error((e as ErrorEvent).message ?? "Deepgram WS error"));
    };
    conn.socket.addEventListener("open", onOpen);
    conn.socket.addEventListener("close", onClose);
    conn.socket.addEventListener("error", onError);
  });
};

/** Returns true if the buffer starts with the WAV/RIFF magic bytes. */
const isWav = (buf: ArrayBuffer): boolean => {
  if (buf.byteLength < 4) return false;
  const v = new Uint8Array(buf, 0, 4);
  return v[0] === 0x52 && v[1] === 0x49 && v[2] === 0x46 && v[3] === 0x46; // "RIFF"
};

const WAV_HEADER_BYTES = 44;

class DeepgramSttStream implements SttStreamPort {
  private conn: V1Socket | null = null;
  private readonly pending: ArrayBuffer[] = [];
  private readonly parts: string[] = [];
  private aborted = false;
  private setupError: Error | null = null;

  // Single setup chain — finalize() awaits this before sending CloseStream,
  // guaranteeing all pending chunks are flushed first (fixes the race condition).
  private readonly readyPromise: Promise<void>;

  constructor(connPromise: Promise<V1Socket>) {
    logger.debug("[deepgram-stt] stream created, waiting for WS open");

    this.readyPromise = connPromise
      .then(async (conn) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sock = (conn as any).socket;
        logger.debug(
          {
            connReadyState: conn.readyState,
            socketReadyState: sock?.readyState,
            wsReadyState: sock?._ws?.readyState,
            wsIsNull: sock?._ws === null,
            wsIsUndefined: sock?._ws === undefined,
            retryCount: sock?._retryCount,
            shouldReconnect: sock?._shouldReconnect,
            connectLock: sock?._connectLock,
            closeCalled: sock?._closeCalled,
            startClosed: sock?._options?.startClosed,
            maxRetries: sock?._options?.maxRetries,
          },
          "[deepgram-stt] connPromise resolved — socket internals",
        );

        if (this.aborted) {
          logger.debug("[deepgram-stt] aborted before open — closing conn");
          conn.close();
          return;
        }

        // Register the message handler before connect() so no Results events are missed.
        conn.on("message", (msg) => {
          logger.debug({ type: msg.type }, "[deepgram-stt] message received");
          if (msg.type === "Results" && msg.is_final) {
            const text = msg.channel.alternatives[0]?.transcript;
            logger.debug({ text }, "[deepgram-stt] is_final result");
            if (text) this.parts.push(text);
          }
        });

        // connect() starts the actual WebSocket handshake — required by the SDK.
        // Without this call, the socket stays CLOSED (readyState=3).
        conn.connect();

        await waitForOpenOrFail(conn);

        logger.debug({ readyState: conn.readyState }, "[deepgram-stt] WS is open");

        if (this.aborted) {
          logger.debug("[deepgram-stt] aborted after open — closing conn");
          conn.close();
          return;
        }

        this.conn = conn;

        logger.debug(
          { pendingChunks: this.pending.length },
          "[deepgram-stt] flushing pending chunks",
        );
        for (const chunk of this.pending) conn.sendMedia(chunk);
        this.pending.length = 0;
      })
      .catch((e: unknown) => {
        const error = e instanceof Error ? e : new Error(String(e));
        logger.error({ err: error }, "[deepgram-stt] setup failed (connPromise or waitForOpen)");
        this.setupError = error;
      });
  }

  write(chunk: ArrayBuffer): void {
    if (this.aborted) return;

    // Strip WAV RIFF header — Deepgram streaming expects raw PCM linear16.
    const audio = isWav(chunk) ? chunk.slice(WAV_HEADER_BYTES) : chunk;

    logger.debug({ bytes: audio.byteLength, connReady: !!this.conn }, "[deepgram-stt] write()");

    if (this.conn) {
      this.conn.sendMedia(audio);
    } else {
      this.pending.push(audio);
    }
  }

  async finalize(): Promise<Result<Transcript>> {
    if (this.aborted) return ok(new Transcript(""));

    logger.debug("[deepgram-stt] finalize() — awaiting readyPromise");
    await this.readyPromise;
    logger.debug(
      { setupError: this.setupError?.message, hasConn: !!this.conn },
      "[deepgram-stt] readyPromise resolved",
    );

    if (this.setupError) return err(this.setupError);
    if (!this.conn || this.aborted) return ok(new Transcript(this.parts.join(" ")));

    const conn = this.conn;
    return new Promise((resolve) => {
      // Register close/error only at finalize time — conn.on() is single-slot,
      // safe to overwrite now that the "message" streaming phase is done.
      conn.on("close", (event) => {
        logger.debug({ closeCode: event.code }, "[deepgram-stt] close event received");
        resolve(ok(new Transcript(this.parts.join(" "))));
      });

      conn.on("error", (e) => {
        logger.error({ err: e }, "[deepgram-stt] error event in finalize");
        resolve(err(e));
      });

      logger.debug("[deepgram-stt] sending CloseStream");
      try {
        conn.sendCloseStream({ type: "CloseStream" });
      } catch (e) {
        logger.error({ err: e }, "[deepgram-stt] sendCloseStream() threw");
        resolve(err(e instanceof Error ? e : new Error(String(e))));
      }
    });
  }

  abort(): void {
    logger.debug("[deepgram-stt] abort()");
    this.aborted = true;
    this.pending.length = 0;
    try {
      this.conn?.close();
    } catch {
      // ignore
    }
  }
}

export class DeepgramSttAdapter implements SttProviderPort {
  private readonly client: DeepgramClient;

  constructor() {
    this.client = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  }

  createStream(): SttStreamPort {
    logger.debug("[deepgram-stt] createStream() — opening WS connection");

    const connPromise = this.client.listen.v1.connect({
      Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      model: "nova-3",
      // "multi" is Deepgram batch-only — omit for streaming (Deepgram auto-detects)
      language: env.AGENT_LANGUAGE !== "multi" ? env.AGENT_LANGUAGE : undefined,
      smart_format: "true",
      punctuate: "true",
      interim_results: "false",
      encoding: "linear16",
      sample_rate: 16000,
      // Disable auto-reconnect: a reconnect mid-stream loses parts[] and gives wrong results.
      // With reconnectAttempts=0, errors propagate immediately — waitForOpen() rejects
      // instead of hanging indefinitely (the bug from the previous streaming attempt).
      reconnectAttempts: 0,
      // Safety net: if the WS never opens and no error fires (TCP hang, silent firewall),
      // the SDK throws after this delay instead of hanging forever.
      connectionTimeoutInSeconds: 5,
    });

    return new DeepgramSttStream(connPromise);
  }
}
