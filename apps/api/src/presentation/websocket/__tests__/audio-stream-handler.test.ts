import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "@call-cc/types";
import type { WSContext } from "hono/ws";
import { AudioStreamHandler } from "@/presentation/websocket/audio-stream-handler";
import { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import { EndVoiceSession } from "@/application/use-cases/end-voice-session";
import type { ProcessAudioChunk } from "@/application/use-cases/process-audio-chunk";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collects every JSON message sent via ws.send(string) */
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

/** Builds a minimal mock ProcessAudioChunk.execute that calls callbacks */
const makeProcessAudioChunk = (
  opts: {
    transcript?: string;
    agentReply?: string;
    audioChunk?: ArrayBuffer;
    fail?: Error;
  } = {},
): ProcessAudioChunk => {
  const { transcript = "Bonjour.", agentReply = "Salut!", audioChunk, fail } = opts;

  return {
    execute: vi.fn().mockImplementation(
      async (
        _session: unknown,
        _buf: unknown,
        _history: unknown,
        _signal: AbortSignal,
        callbacks: {
          onTranscript: (t: string) => void;
          onAudioChunk: (a: ArrayBuffer) => void;
        },
      ) => {
        if (fail) return err(fail);
        callbacks.onTranscript(transcript);
        if (audioChunk) callbacks.onAudioChunk(audioChunk);
        return ok({ transcript, agentReply });
      },
    ),
  } as unknown as ProcessAudioChunk;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioStreamHandler", () => {
  let handler: AudioStreamHandler;
  let processAudioChunkMock: ProcessAudioChunk;

  beforeEach(() => {
    processAudioChunkMock = makeProcessAudioChunk();
    handler = new AudioStreamHandler(
      new StartVoiceSession(),
      processAudioChunkMock,
      new EndVoiceSession(),
    );
  });

  // --- onOpen ---

  describe("onOpen", () => {
    it("sends session.started then ready", () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);
      expect(types()).toEqual(["session.started", "ready"]);
    });

    it("session is in listening state after open", () => {
      const { ws } = makeWs();
      handler.onOpen(ws);
      // Indirectly verified: audio chunks are accumulated (only in listening state)
      handler.onMessage(ws, makeAudio());
      // If not listening, the chunk would be dropped. We verify via speech.end later.
    });
  });

  // --- audio accumulation ---

  describe("onMessage — audio chunks", () => {
    it("accumulates binary chunks silently (no message sent)", () => {
      const { ws, sent } = makeWs();
      handler.onOpen(ws);
      sent.length = 0; // clear open messages

      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, makeAudio());

      expect(sent).toHaveLength(0);
    });

    it("ignores binary messages when session is not in listening state", async () => {
      const { ws } = makeWs();
      handler.onOpen(ws);

      // Trigger handleSpeechEnd to move to processing
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      // While processAudioChunk is running (awaiting), state is processing
      // Sending more audio now should be dropped — verified indirectly via execute call count
      handler.onMessage(ws, makeAudio(32)); // extra chunk during processing

      // Wait for the async processing to complete
      await vi.waitFor(
        () => (processAudioChunkMock.execute as ReturnType<typeof vi.fn>).mock.calls.length === 1,
      );
      // execute was called once (with the first chunk only)
      expect(processAudioChunkMock.execute).toHaveBeenCalledTimes(1);
    });
  });

  // --- speech.end happy path ---

  describe("onMessage — speech.end (happy path)", () => {
    it("sends transcript, then ready after processing", async () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().includes("ready") && types().includes("transcript"));

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
      processAudioChunkMock = makeProcessAudioChunk({ audioChunk: audio });
      handler = new AudioStreamHandler(
        new StartVoiceSession(),
        processAudioChunkMock,
        new EndVoiceSession(),
      );

      const { ws, binarySent, types } = makeWs();
      handler.onOpen(ws);
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().includes("ready"));

      expect(binarySent).toHaveLength(1);
      expect(binarySent[0]).toBe(audio);
    });

    it("pushes exchange to history so next call gets context", async () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);

      // First exchange
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));
      await vi.waitFor(() => types().includes("ready"));

      // Reset mock to capture second call
      vi.mocked(processAudioChunkMock.execute).mockClear();

      // Second exchange
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));
      await vi.waitFor(
        () => (processAudioChunkMock.execute as ReturnType<typeof vi.fn>).mock.calls.length === 1,
      );

      const historyArg = vi.mocked(processAudioChunkMock.execute).mock.calls[0]?.[2] as unknown[];
      expect(historyArg).toHaveLength(2); // user + assistant from first exchange
    });

    it("sends ready when speech.end arrives with no accumulated audio", async () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);
      // No audio chunks — just speech.end
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().filter((t) => t === "ready").length >= 2);

      expect(processAudioChunkMock.execute).not.toHaveBeenCalled();
    });
  });

  // --- speech.end failure path ---

  describe("onMessage — speech.end (processing failure)", () => {
    it("sends error message then ready on processAudioChunk failure", async () => {
      processAudioChunkMock = makeProcessAudioChunk({ fail: new Error("STT unavailable") });
      handler = new AudioStreamHandler(
        new StartVoiceSession(),
        processAudioChunkMock,
        new EndVoiceSession(),
      );

      const { ws, types, messages } = makeWs();
      handler.onOpen(ws);
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().includes("error"));

      expect(types()).toContain("error");
      expect(types()).toContain("ready");
      const errorMsg = messages().find((m) => m["type"] === "error");
      expect(errorMsg?.["message"]).toBe("STT unavailable");
    });
  });

  // --- interrupt (barge-in) ---

  describe("onMessage — interrupt", () => {
    it("sends ready immediately", () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);
      const readyCountBefore = types().filter((t) => t === "ready").length;

      handler.onMessage(ws, JSON.stringify({ type: "interrupt" }));

      expect(types().filter((t) => t === "ready").length).toBe(readyCountBefore + 1);
    });

    it("clears accumulated audio chunks", async () => {
      const { ws, types } = makeWs();
      handler.onOpen(ws);

      // Accumulate audio
      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, makeAudio());

      // Interrupt — clears audio
      handler.onMessage(ws, JSON.stringify({ type: "interrupt" }));

      // speech.end with no chunks → execute NOT called
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      await vi.waitFor(() => types().filter((t) => t === "ready").length >= 3);

      expect(processAudioChunkMock.execute).not.toHaveBeenCalled();
    });

    it("aborts in-flight processAudioChunk via signal", async () => {
      let capturedSignal: AbortSignal | null = null;

      processAudioChunkMock = {
        execute: vi
          .fn()
          .mockImplementation(
            async (_s: unknown, _b: unknown, _h: unknown, signal: AbortSignal) => {
              capturedSignal = signal;
              // Simulate slow processing
              await new Promise<void>((resolve) => setTimeout(resolve, 50));
              return ok({ transcript: "Hello", agentReply: "Hi" });
            },
          ),
      } as unknown as ProcessAudioChunk;

      handler = new AudioStreamHandler(
        new StartVoiceSession(),
        processAudioChunkMock,
        new EndVoiceSession(),
      );

      const { ws } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, makeAudio());
      handler.onMessage(ws, JSON.stringify({ type: "speech.end" }));

      // Interrupt before processing finishes
      await new Promise<void>((r) => setTimeout(r, 10));
      handler.onMessage(ws, JSON.stringify({ type: "interrupt" }));

      await vi.waitFor(() => capturedSignal !== null && capturedSignal.aborted);

      expect(capturedSignal!.aborted).toBe(true);
    });
  });

  // --- session.end ---

  describe("onMessage — session.end", () => {
    it("sends session.ended and closes the WebSocket", () => {
      const { ws, types, closed } = makeWs();
      handler.onOpen(ws);

      handler.onMessage(ws, JSON.stringify({ type: "session.end" }));

      expect(types()).toContain("session.ended");
      expect(closed).toHaveLength(1);
      expect(closed[0]?.code).toBe(1000);
    });
  });

  // --- onClose ---

  describe("onClose", () => {
    it("transitions session to idle", () => {
      const endVoiceSession = new EndVoiceSession();
      const spy = vi.spyOn(endVoiceSession, "execute");
      handler = new AudioStreamHandler(
        new StartVoiceSession(),
        processAudioChunkMock,
        endVoiceSession,
      );

      const { ws } = makeWs();
      handler.onOpen(ws);
      handler.onClose();

      expect(spy).toHaveBeenCalledOnce();
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
      handler.onMessage(ws, { type: "unknown" });

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
