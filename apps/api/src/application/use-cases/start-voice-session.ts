import type { Result } from "@call-cc/types";
import { ok } from "@call-cc/types";
import { VoiceSession } from "../../domain/entities/voice-session.js";

export class StartVoiceSession {
  execute(sessionId: string): Result<VoiceSession> {
    const session = new VoiceSession(sessionId);
    session.transition("listening");
    return ok(session);
  }
}
