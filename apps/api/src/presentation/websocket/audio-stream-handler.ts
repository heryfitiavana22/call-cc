import type { WSContext } from "hono/ws";
import type { ClientMessage, ServerMessage } from "@call-cc/types";
import { clientMessageSchema } from "@call-cc/types";
import type { ProcessVoiceTurn } from "@/application/use-cases/process-voice-turn";
import type { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import type { EndVoiceSession } from "@/application/use-cases/end-voice-session";
import type { VoiceSession } from "@/domain/entities/voice-session";
import type { LlmMessage } from "@/domain/ports/llm-provider-port";
import { logger } from "@/shared/logger";

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
    private readonly voiceTurn: ProcessVoiceTurn,
    private readonly endVoiceSession: EndVoiceSession,
  ) {}

  onOpen(ws: WSContext): void {
    const result = this.startVoiceSession.execute(generateSessionId());
    if (!result.ok) {
      logger.error({ err: result.error }, "Failed to start voice session");
      ws.close(1011, "Failed to start session");
      return;
    }
    this.session = result.value;
    logger.info({ sessionId: this.session.id }, "Voice session opened");
    this.voiceTurn.begin();
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
      logger.info({ sessionId: this.session.id }, "Voice session closed");
      this.endVoiceSession.execute(this.session);
      this.session = null;
    }
    this.abortController.abort();
    this.voiceTurn.abort();
  }

  private handleAudioChunk(chunk: ArrayBuffer): void {
    if (!this.session || this.session.state !== "listening") return;
    this.voiceTurn.addChunk(chunk);
  }

  private async handleSpeechEnd(ws: WSContext): Promise<void> {
    if (!this.session) {
      this.send(ws, { type: "ready" });
      return;
    }

    // Capture the signal now — a barge-in may replace abortController before end() returns
    const signal = this.abortController.signal;

    const result = await this.voiceTurn.end(this.session, [...this.history], signal, {
      onTranscript: (text) => this.send(ws, { type: "transcript", text, final: true }),
      onAudioChunk: (audio) => ws.send(audio),
    });

    if (!result.ok) {
      if (signal.aborted) return;
      this.send(ws, { type: "error", message: result.error.message });
      this.send(ws, { type: "ready" });
      this.session.transition("listening");
      return;
    }

    if (result.value.transcript) {
      this.history.push({ role: "user", content: result.value.transcript });
      this.history.push({ role: "assistant", content: result.value.agentReply });
      this.send(ws, { type: "agent.reply", text: result.value.agentReply });
    }

    // Open a new stream for the next utterance
    this.voiceTurn.begin();
    this.send(ws, { type: "ready" });
    this.session.transition("listening");
  }

  private handleControlMessage(ws: WSContext, message: ClientMessage): void {
    if (message.type === "speech.end") {
      void this.handleSpeechEnd(ws);
      return;
    }

    if (message.type === "interrupt") {
      logger.info({ sessionId: this.session?.id }, "Barge-in interrupt received");
      this.abortController.abort();
      this.abortController = new AbortController();
      this.voiceTurn.abort();
      this.voiceTurn.begin();
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
