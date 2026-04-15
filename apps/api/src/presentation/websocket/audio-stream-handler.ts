import type { WSContext } from "hono/ws";
import type { ClientMessage, ServerMessage } from "@call-cc/types";
import { clientMessageSchema } from "@call-cc/types";
import type { ProcessAudioChunk } from "@/application/use-cases/process-audio-chunk";
import type { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import type { EndVoiceSession } from "@/application/use-cases/end-voice-session";
import type { VoiceSession } from "@/domain/entities/voice-session";
import type { LlmMessage } from "@/domain/ports/i-llm-provider";

const SESSION_ID_LENGTH = 8;

const generateSessionId = (): string =>
  Math.random()
    .toString(36)
    .slice(2, 2 + SESSION_ID_LENGTH);

/**
 * Concatenates an array of ArrayBuffers into a single ArrayBuffer.
 */
const mergeBuffers = (chunks: ArrayBuffer[]): ArrayBuffer => {
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
};

export class AudioStreamHandler {
  private session: VoiceSession | null = null;
  private abortController: AbortController = new AbortController();
  private history: LlmMessage[] = [];
  // Audio chunks accumulated between speech.start and speech.end
  private audioChunks: ArrayBuffer[] = [];

  constructor(
    private readonly startVoiceSession: StartVoiceSession,
    private readonly processAudioChunk: ProcessAudioChunk,
    private readonly endVoiceSession: EndVoiceSession,
  ) {}

  onOpen(ws: WSContext): void {
    const result = this.startVoiceSession.execute(generateSessionId());
    if (!result.ok) {
      ws.close(1011, "Failed to start session");
      return;
    }
    this.session = result.value;
    this.send(ws, { type: "session.started" });
    this.send(ws, { type: "ready" });
  }

  onMessage(ws: WSContext, data: unknown): void {
    if (data instanceof ArrayBuffer) {
      this.handleAudioChunk(data);
      return;
    }

    if (typeof data !== "string") return;

    const message = this.parseMessage(data);
    if (!message) return;

    this.handleControlMessage(ws, message);
  }

  onClose(): void {
    if (this.session) {
      this.endVoiceSession.execute(this.session);
      this.session = null;
    }
    this.abortController.abort();
    this.audioChunks = [];
  }

  /**
   * Accumulates raw audio chunks into a buffer.
   * The buffer is flushed when speech.end is received.
   */
  private handleAudioChunk(chunk: ArrayBuffer): void {
    if (!this.session || this.session.state !== "listening") return;
    this.audioChunks.push(chunk);
  }

  /**
   * Merges the accumulated audio buffer and triggers STT → LLM → TTS pipeline.
   */
  private async handleSpeechEnd(ws: WSContext): Promise<void> {
    if (!this.session || this.audioChunks.length === 0) {
      this.send(ws, { type: "ready" });
      return;
    }

    const audioBuffer = mergeBuffers(this.audioChunks);
    this.audioChunks = [];

    const result = await this.processAudioChunk.execute(
      this.session,
      audioBuffer,
      this.history,
      this.abortController.signal,
    );

    if (!result.ok) {
      this.send(ws, { type: "error", message: result.error.message });
      this.send(ws, { type: "ready" });
      this.session.transition("listening");
      return;
    }

    this.history.push({ role: "user", content: result.value.transcript });
    this.history.push({ role: "assistant", content: result.value.agentReply });
    this.send(ws, { type: "transcript", text: result.value.transcript, final: true });

    ws.send(result.value.audioResponse);

    this.send(ws, { type: "ready" });
    this.session.transition("listening");
  }

  private handleControlMessage(ws: WSContext, message: ClientMessage): void {
    if (message.type === "speech.end") {
      void this.handleSpeechEnd(ws);
      return;
    }

    if (message.type === "interrupt") {
      this.abortController.abort();
      this.abortController = new AbortController();
      this.audioChunks = [];
      if (this.session) this.session.transition("listening");
      this.send(ws, { type: "ready" });
      return;
    }

    if (message.type === "session.end") {
      if (this.session) this.endVoiceSession.execute(this.session);
      this.send(ws, { type: "session.ended" });
      ws.close(1000, "Session ended");
    }
  }

  private send(ws: WSContext, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  private parseMessage(raw: string) {
    try {
      const parsed = clientMessageSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
