import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "@call-cc/types";
import type { WSContext } from "hono/ws";
import { AudioStreamHandler } from "@/presentation/websocket/audio-stream-handler";
import { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import { EndVoiceSession } from "@/application/use-cases/end-voice-session";
import type { ProcessVoiceTurn } from "@/application/use-cases/process-voice-turn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeWs = () => {
  const sent: string[] = [];
  const binarySent: unknown[] = [];
  const closed: { code: number; reason: string }[] = [];

  const ws = {
    send: vi.fn((data: unknown) => {
      if (typeof data === "string") sent.push(data);
      else binarySent.push(data);
    }),
    close: vi.fn((code: number, reason: string) => {
      closed.push({ code, reason });
    }),
  } as unknown as WSContext;

  const messages = () => sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  const types = () => messages().map((m) => m["type"]);

  return { ws, sent, binarySent, closed, messages, types };
};

const makeAudio = (bytes = 16) => new ArrayBuffer(bytes);

/**
 * Builds a minimal ProcessVoiceTurn mock.
 * begin() / addChunk() / abort() are no-ops.
 * end() calls the callbacks and returns the configured result.
 */
const makeVoiceTurn = (
  opts: {
    transcript?: string;
    agentReply?: string;
    audioChunk?: ArrayBuffer;
    fail?: Error;
    slowMs?: number;
  } = {},
): ProcessVoiceTurn => {
  const { transcript = "Bonjour.", agentReply = "Salut!", audioChunk, fail, slowMs } = opts;

  return {
    begin: vi.fn(),
    addChunk: vi.fn(),
    abort: vi.fn(),
    end: vi.fn().mockImplementation(
      async (
        session: { transition: (s: string) => void },
        _history: unknown,
        _signal: AbortSignal,
        callbacks: {
          onTranscript: (t: string) => void;
          onAudioChunk: (a: ArrayBuffer) => void;
        },
      ) => {
        // Simulate the real ProcessVoiceTurn: transition to processing immediately
        session.transition("processing");
        if (slowMs) await new Promise<void>((r) => setTimeout(r, slowMs));
        if (fail) return err(fail);
        callbacks.onTranscript(transcript);
        if (audioChunk) callbacks.onAudioChunk(audioChunk);
        return ok({ transcript, agentReply });
      },
    ),
  } as unknown as ProcessVoiceTurn;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioStreamHandler", () => {
  let handler: AudioStreamHandler;
  let voiceTurnMock: ProcessVoiceTurn;

  beforeEach(() => {
    voiceTurnMock = makeVoiceTurn();
    handler = new AudioStreamHandler(new StartVoiceSession(), voiceTurnMock, new EndVoiceSession());
  });

  // --- onOpen ---

  describe("onOpen", () => {
    it("sends session.started then ready", () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);
      expect(types()).toEqual(["session.started", "ready"]);
    });

    it("calls begin() on the voice turn", () => {
      const { ws } = makeWs();
      handler.onOpen(ws);
      expect(voiceTurnMock.begin).toHaveBeenCalledOnce();
    });
  });

  // --- audio chunks ---

  describe("onMessage — audio chunks", () => {
    it("forwards chunks to voiceTurn.addChunk() silently", () => {
      const { ws, sent } = makeWs();
      handler.onOpen(ws);
      sent.length = 0;

      const chunk1 = makeAudio();
      const chunk2 = makeAudio();
      handler.onMessage(ws, chunk1);
      handler.onMessage(ws, chunk2);

      expect(sent).toHaveLength(0);
      expect(voiceTurnMock.addChunk).toHaveBeenCalledTimes(2);
      expect(voiceTurnMock.addChunk).toHaveBeenNthCalledWith(1, chunk1);
      expect(voiceTurnMock.addChunk).toHaveBeenNthCalledWith(2, chunk2);
    });

    it("drops chunks when session state is not listening", async () => {
      const { ws } = makeWs();
      handler.onOpen(ws);

      // Trigger speech.end → session moves to processing
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      // This chunk arrives while processing — should be dropped
      handler.onMessage(ws, makeAudio(32));

      await vi.waitFor(
        () => (voiceTurnMock.end as ReturnType<typeof vi.fn>).mock.calls.length === 1,
      );

      // addChunk called once (first chunk before speech.end), not for the one during processing
      const addChunkCalls = (voiceTurnMock.addChunk as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(addChunkCalls).toBe(1);
    });
  });

  // --- speech.end happy path ---

  describe("onMessage — speech.end (happy path)", () => {
    it("sends transcript then ready", async () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(
        () => types().includes("transcript") && types().filter((t) => t === "ready").length >= 2,
      );

      expect(types()).toContain("transcript");
      expect(types()).toContain("ready");
    });

    it("transcript message carries the STT text", async () => {
      const { ws, messages } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => messages().some((m) => m["type"] === "transcript"));

      const transcript = messages().find((m) => m["type"] === "transcript");
      expect(transcript?.["text"]).toBe("Bonjour.");
    });

    it("sends audio binary chunk via ws.send", async () => {
      const audio = makeAudio(64);
      voiceTurnMock = makeVoiceTurn({ audioChunk: audio });
      handler = new AudioStreamHandler(
        new StartVoiceSession(),
        voiceTurnMock,
        new EndVoiceSession(),
      );

      const { ws, binarySent, types } = makeWs();
      handler.onOpen(ws);
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().filter((t) => t === "ready").length >= 2);

      expect(binarySent).toHaveLength(1);
      expect(binarySent[0]).toBe(audio);
    });

    it("calls begin() again after end() so next turn has a fresh stream", async () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().filter((t) => t === "ready").length >= 2);

      // begin() called once on open + once after end()
      expect(voiceTurnMock.begin).toHaveBeenCalledTimes(2);
    });

    it("passes history snapshot so second turn receives first exchange", async () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);

      // First exchange
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));
      await vi.waitFor(() => types().filter((t) => t === "ready").length >= 2);

      vi.mocked(voiceTurnMock.end).mockClear();

      // Second exchange
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));
      await vi.waitFor(
        () => (voiceTurnMock.end as ReturnType<typeof vi.fn>).mock.calls.length === 1,
      );

      const historyArg = vi.mocked(voiceTurnMock.end).mock.calls[0]?.[1] as unknown[];
      expect(historyArg).toHaveLength(2); // user + assistant from first exchange
    });
  });

  // --- speech.end failure ---

  describe("onMessage — speech.end (failure)", () => {
    it("sends error then ready when end() fails", async () => {
      voiceTurnMock = makeVoiceTurn({ fail: new Error("STT unavailable") });
      handler = new AudioStreamHandler(
        new StartVoiceSession(),
        voiceTurnMock,
        new EndVoiceSession(),
      );

      const { ws, types, messages } = makeWs();
      handler.onOpen(ws);
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().includes("error"));

      expect(types()).toContain("error");
      expect(types()).toContain("ready");
      expect(messages().find((m) => m["type"] === "error")?.["message"]).toBe("STT unavailable");
    });
  });

  // --- interrupt (barge-in) ---

  describe("onMessage — interrupt", () => {
    it("sends ready immediately", () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);
      const readyBefore = types().filter((t) => t === "ready").length;

      handler.onMessage(ws, JSON.stringify({ type: "interrupt" }));

      expect(types().filter((t) => t === "ready").length).toBe(readyBefore + 1);
    });

    it("calls abort() then begin() on the voice turn", () => {
      const { ws } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, JSON.stringify({ type: "interrupt" }));

      expect(voiceTurnMock.abort).toHaveBeenCalledOnce();
      expect(voiceTurnMock.begin).toHaveBeenCalledTimes(2); // once on open, once after interrupt
    });

    it("aborts in-flight end() via signal", async () => {
      let capturedSignal: AbortSignal | null = null;
      voiceTurnMock = makeVoiceTurn({ slowMs: 50 });
      vi.mocked(voiceTurnMock.end).mockImplementation(
        async (_session, _history, signal: AbortSignal) => {
          capturedSignal = signal;
          await new Promise<void>((r) => setTimeout(r, 50));
          return ok({ transcript: "Hello", agentReply: "Hi" });
        },
      );

      handler = new AudioStreamHandler(
        new StartVoiceSession(),
        voiceTurnMock,
        new EndVoiceSession(),
      );

      const { ws } = makeWs();
      handler.onOpen(ws);
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await new Promise<void>((r) => setTimeout(r, 10));
      handler.onMessage(ws, JSON.stringify({ type: "interrupt" }));

      await vi.waitFor(() => capturedSignal !== null && capturedSignal.aborted);
      expect(capturedSignal).toMatchObject({ aborted: true });
    });
  });

  // --- session.end ---

  describe("onMessage — session.end", () => {
    it("sends session.ended and closes the WebSocket", () => {
      const { ws, types, closed } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, JSON.stringify({ type: "session.end" }));

      expect(types()).toContain("session.ended");
      expect(closed[0]?.code).toBe(1000);
    });
  });

  // --- onClose ---

  describe("onClose", () => {
    it("calls endVoiceSession and abort on close", () => {
      const endVoiceSession = new EndVoiceSession();
      const spy = vi.spyOn(endVoiceSession, "execute");
      handler = new AudioStreamHandler(new StartVoiceSession(), voiceTurnMock, endVoiceSession);

      const { ws } = makeWs();
      handler.onOpen(ws);
      handler.onClose();

      expect(spy).toHaveBeenCalledOnce();
      expect(voiceTurnMock.abort).toHaveBeenCalledOnce();
    });

    it("is safe to call without a prior onOpen", () => {
      expect(() => handler.onClose()).not.toThrow();
    });
  });

  // --- unknown / malformed messages ---

  describe("onMessage — unknown data", () => {
    it("ignores non-string, non-ArrayBuffer data silently", () => {
      const { ws, sent } = makeWs();
      handler.onOpen(ws);
      const before = sent.length;

      handler.onMessage(ws, 42);
      handler.onMessage(ws, null);

      expect(sent.length).toBe(before);
    });

    it("ignores malformed JSON strings", () => {
      const { ws, sent } = makeWs();
      handler.onOpen(ws);
      const before = sent.length;

      handler.onMessage(ws, "not json {{{");

      expect(sent.length).toBe(before);
    });

    it("ignores valid JSON with unknown type", () => {
      const { ws, sent } = makeWs();
      handler.onOpen(ws);
      const before = sent.length;

      handler.onMessage(ws, JSON.stringify({ type: "unknown-event" }));

      expect(sent.length).toBe(before);
    });
  });
});
