import { describe, it, expect } from "vitest";
import { EndVoiceSession } from "./end-voice-session";
import { VoiceSession } from "@/domain/entities/voice-session";

describe("EndVoiceSession", () => {
  const useCase = new EndVoiceSession();

  it("transitions session to idle", () => {
    const session = new VoiceSession("x");
    session.transition("listening");

    useCase.execute(session);

    expect(session.state).toBe("idle");
  });

  it("works from any active state", () => {
    for (const state of ["listening", "processing", "speaking"] as const) {
      const session = new VoiceSession("x");
      session.transition(state);
      useCase.execute(session);
      expect(session.state).toBe("idle");
    }
  });

  it("is idempotent — calling twice leaves session idle", () => {
    const session = new VoiceSession("x");
    session.transition("listening");

    useCase.execute(session);
    useCase.execute(session);

    expect(session.state).toBe("idle");
  });
});
