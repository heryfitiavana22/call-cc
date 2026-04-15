import { describe, it, expect } from "vitest";
import { StartVoiceSession } from "./start-voice-session";

describe("StartVoiceSession", () => {
  const useCase = new StartVoiceSession();

  it("returns ok with a VoiceSession", () => {
    const result = useCase.execute("sess-1");
    expect(result.ok).toBe(true);
  });

  it("session has the provided id", () => {
    const result = useCase.execute("sess-abc");
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.id).toBe("sess-abc");
  });

  it("session starts in listening state", () => {
    const result = useCase.execute("sess-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.state).toBe("listening");
  });

  it("session isActive() returns true", () => {
    const result = useCase.execute("sess-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.isActive()).toBe(true);
  });

  it("each call creates an independent session", () => {
    const r1 = useCase.execute("a");
    const r2 = useCase.execute("b");
    if (!r1.ok || !r2.ok) throw new Error("expected ok");
    expect(r1.value).not.toBe(r2.value);
    expect(r1.value.id).toBe("a");
    expect(r2.value.id).toBe("b");
  });
});
