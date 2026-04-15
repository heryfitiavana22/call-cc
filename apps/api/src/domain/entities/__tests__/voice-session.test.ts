import { describe, it, expect } from "vitest";
import { VoiceSession } from "@/domain/entities/voice-session";

describe("VoiceSession", () => {
  describe("constructor", () => {
    it("initialises with idle state", () => {
      const session = new VoiceSession("abc123");
      expect(session.state).toBe("idle");
    });

    it("stores the provided id", () => {
      const session = new VoiceSession("my-id");
      expect(session.id).toBe("my-id");
    });

    it("sets createdAt to a recent date", () => {
      const before = new Date();
      const session = new VoiceSession("x");
      const after = new Date();
      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("isActive", () => {
    it("returns false when state is idle", () => {
      const session = new VoiceSession("x");
      expect(session.isActive()).toBe(false);
    });

    it("returns true when state is listening", () => {
      const session = new VoiceSession("x");
      session.transition("listening");
      expect(session.isActive()).toBe(true);
    });

    it("returns true when state is processing", () => {
      const session = new VoiceSession("x");
      session.transition("processing");
      expect(session.isActive()).toBe(true);
    });

    it("returns true when state is speaking", () => {
      const session = new VoiceSession("x");
      session.transition("speaking");
      expect(session.isActive()).toBe(true);
    });
  });

  describe("transition", () => {
    it("updates state to the given value", () => {
      const session = new VoiceSession("x");
      session.transition("listening");
      expect(session.state).toBe("listening");
    });

    it("allows full lifecycle: idle → listening → processing → speaking → idle", () => {
      const session = new VoiceSession("x");
      const states: string[] = ["listening", "processing", "speaking", "idle"];
      for (const s of states) {
        session.transition(s as Parameters<typeof session.transition>[0]);
        expect(session.state).toBe(s);
      }
    });

    it("allows transitioning back to the same state", () => {
      const session = new VoiceSession("x");
      session.transition("listening");
      session.transition("listening");
      expect(session.state).toBe("listening");
    });
  });
});
