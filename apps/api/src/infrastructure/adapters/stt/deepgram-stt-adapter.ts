import { DeepgramClient } from "@deepgram/sdk";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { ISttProvider, ISttStream } from "@/domain/ports/i-stt-provider";
import { Transcript } from "@/domain/value-objects/transcript";
import { env } from "@/config/env";

type DeepgramConn = Awaited<ReturnType<DeepgramClient["listen"]["v1"]["connect"]>>;

/**
 * Streaming STT stream backed by Deepgram's live WebSocket API.
 *
 * - Audio chunks are forwarded immediately once the socket is open.
 * - Chunks that arrive before the socket opens are queued and flushed on open.
 * - finalize() sends a Finalize control message and waits for socket close,
 *   collecting all is_final transcript fragments along the way.
 */
class DeepgramSttStream implements ISttStream {
  private conn: DeepgramConn | null = null;
  private pending: ArrayBuffer[] = [];
  private parts: string[] = [];
  private aborted = false;
  private closeCallbacks: Array<() => void> = [];
  private errorCallbacks: Array<(e: Error) => void> = [];

  constructor(private readonly connPromise: Promise<DeepgramConn>) {
    connPromise
      .then((conn) => {
        if (this.aborted) {
          conn.close();
          return;
        }
        this.conn = conn;

        for (const chunk of this.pending) conn.sendMedia(chunk);
        this.pending = [];

        conn.on("message", (msg) => {
          if (msg.type === "Results" && msg.is_final) {
            const text = msg.channel?.alternatives?.[0]?.transcript;
            if (text) this.parts.push(text);
          }
        });

        conn.on("close", () => {
          for (const cb of this.closeCallbacks) cb();
        });

        conn.on("error", (e) => {
          const error = e instanceof Error ? e : new Error(String(e));
          for (const cb of this.errorCallbacks) cb(error);
        });
      })
      .catch((e) => {
        const error = e instanceof Error ? e : new Error(String(e));
        for (const cb of this.errorCallbacks) cb(error);
      });
  }

  write(chunk: ArrayBuffer): void {
    if (this.aborted) return;
    if (this.conn) {
      this.conn.sendMedia(chunk);
    } else {
      this.pending.push(chunk);
    }
  }

  finalize(): Promise<Result<Transcript>> {
    if (this.aborted) return Promise.resolve(ok(new Transcript("")));

    return new Promise((resolve) => {
      this.closeCallbacks.push(() => {
        resolve(ok(new Transcript(this.parts.join(" "))));
      });
      this.errorCallbacks.push((e) => {
        resolve(err(e));
      });

      // Wait for the connection (no-op if already open), then send Finalize.
      // The constructor's .then runs first (pending flushed, handlers set),
      // then this .then triggers finalize — guaranteed by Promise microtask order.
      this.connPromise
        .then((conn) => {
          conn.sendFinalize({ type: "Finalize" });
        })
        .catch((e) => {
          resolve(err(e instanceof Error ? e : new Error(String(e))));
        });
    });
  }

  abort(): void {
    this.aborted = true;
    this.pending = [];
    try {
      this.conn?.close();
    } catch {
      // ignore close errors
    }
  }
}

export class DeepgramSttAdapter implements ISttProvider {
  private readonly client: DeepgramClient;

  constructor() {
    this.client = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  }

  createStream(): ISttStream {
    const connPromise = this.client.listen.v1.connect({
      Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      model: "nova-3",
      language: env.DEEPGRAM_LANGUAGE,
      smart_format: "true",
      punctuate: "true",
      interim_results: "false",
      encoding: "linear16",
      sample_rate: 16000,
    }) as Promise<DeepgramConn>;

    return new DeepgramSttStream(connPromise);
  }
}
