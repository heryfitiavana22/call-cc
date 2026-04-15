import type { VoiceSession } from "../../domain/entities/voice-session.js";

export class EndVoiceSession {
  execute(session: VoiceSession): void {
    session.transition("idle");
  }
}
