import type { WSContext } from "hono/ws";
import type { ClientMessage, ServerMessage } from "@call-cc/types";
import type { ProcessAudioChunk } from "../../application/use-cases/process-audio-chunk.js";
import type { StartVoiceSession } from "../../application/use-cases/start-voice-session.js";
import type { EndVoiceSession } from "../../application/use-cases/end-voice-session.js";
import type { VoiceSession } from "../../domain/entities/voice-session.js";
import type { LlmMessage } from "../../domain/ports/i-llm-provider.js";

const SESSION_ID_LENGTH = 8;

const generateSessionId = (): string =>
  Math.random()
    .toString(36)
    .slice(2, 2 + SESSION_ID_LENGTH);

export class AudioStreamHandler {
  private session: VoiceSession | null = null;
  private abortController: AbortController = new AbortController();
  private history: LlmMessage[] = [];

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
      void this.handleAudioChunk(ws, data);
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
  }

  private async handleAudioChunk(ws: WSContext, chunk: ArrayBuffer): Promise<void> {
    if (!this.session || this.session.state !== "listening") return;

    const result = await this.processAudioChunk.execute(
      this.session,
      chunk,
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
    this.send(ws, { type: "transcript", text: result.value.transcript, final: true });

    ws.send(result.value.audioResponse);

    this.send(ws, { type: "ready" });
    this.session.transition("listening");
  }

  private handleControlMessage(ws: WSContext, message: ClientMessage): void {
    if (message.type === "interrupt") {
      this.abortController.abort();
      this.abortController = new AbortController();
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

  private parseMessage(raw: string): ClientMessage | null {
    try {
      return JSON.parse(raw) as ClientMessage;
    } catch {
      return null;
    }
  }
}
