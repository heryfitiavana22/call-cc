import type { VoiceSession } from "@/domain/entities/voice-session";

export class EndVoiceSession {
  execute(session: VoiceSession): void {
    session.transition("idle");
  }
}
