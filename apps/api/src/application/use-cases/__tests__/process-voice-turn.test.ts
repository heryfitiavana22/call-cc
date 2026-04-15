import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "@call-cc/types";
import { ProcessVoiceTurn } from "@/application/use-cases/process-voice-turn";
import type { ISttProvider, ISttStream } from "@/domain/ports/i-stt-provider";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";
import type { ILlmProvider } from "@/domain/ports/i-llm-provider";
import { VoiceSession } from "@/domain/entities/voice-session";
import { Transcript } from "@/domain/value-objects/transcript";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const makeSttStream = (transcriptText = "Bonjour."): ISttStream => ({
  write: vi.fn(),
  finalize: vi.fn().mockResolvedValue(ok(new Transcript(transcriptText))),
  abort: vi.fn(),
});

const makeFailSttStream = (error = new Error("STT failed")): ISttStream => ({
  write: vi.fn(),
  finalize: vi.fn().mockResolvedValue(err(error)),
  abort: vi.fn(),
});

const makeStt = (stream: ISttStream = makeSttStream()): ISttProvider => ({
  createStream: vi.fn().mockReturnValue(stream),
});

const makeTts = (fail?: Error): ITtsProvider => ({
  synthesize: vi.fn().mockImplementation(async () => {
    if (fail) return err(fail);
    return ok(new ArrayBuffer(8));
  }),
});

async function* tokenGenerator(tokens: string[]) {
  for (const t of tokens) yield t;
}

const makeLlm = (tokens = ["Salut", "!"], fail?: Error): ILlmProvider => ({
  stream: vi.fn().mockImplementation(async function* () {
    if (fail) throw fail;
    yield* tokenGenerator(tokens);
  }),
});

const makeSession = () => new VoiceSession("test-session");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProcessVoiceTurn", () => {
  let sttStream: ISttStream;
  let stt: ISttProvider;
  let tts: ITtsProvider;
  let llm: ILlmProvider;
  let voiceTurn: ProcessVoiceTurn;
  let session: VoiceSession;

  beforeEach(() => {
    sttStream = makeSttStream();
    stt = makeStt(sttStream);
    tts = makeTts();
    llm = makeLlm();
    voiceTurn = new ProcessVoiceTurn(stt, llm, tts);
    session = makeSession();
  });

  // --- begin / addChunk ---

  describe("begin() / addChunk()", () => {
    it("createStream() is called on begin()", () => {
      voiceTurn.begin();
      expect(stt.createStream).toHaveBeenCalledOnce();
    });

    it("addChunk() writes to the active stream", () => {
      const chunk = new ArrayBuffer(16);
      voiceTurn.begin();
      voiceTurn.addChunk(chunk);
      expect(sttStream.write).toHaveBeenCalledWith(chunk);
    });

    it("addChunk() before begin() is a no-op", () => {
      voiceTurn.addChunk(new ArrayBuffer(8));
      expect(sttStream.write).not.toHaveBeenCalled();
    });
  });

  // --- end() happy path ---

  describe("end() — happy path", () => {
    it("returns ok with transcript and agentReply", async () => {
      voiceTurn.begin();
      const result = await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.transcript).toBe("Bonjour.");
      expect(result.value.agentReply).toBe("Salut!");
    });

    it("calls onTranscript with the STT text", async () => {
      const onTranscript = vi.fn();
      voiceTurn.begin();
      await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript,
        onAudioChunk: vi.fn(),
      });
      expect(onTranscript).toHaveBeenCalledWith("Bonjour.");
    });

    it("calls onAudioChunk for each TTS sentence", async () => {
      llm = makeLlm(["Hello", " world."]);
      voiceTurn = new ProcessVoiceTurn(makeStt(sttStream), llm, tts);
      const onAudioChunk = vi.fn();

      voiceTurn.begin();
      await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk,
      });
      expect(onAudioChunk).toHaveBeenCalled();
    });

    it("transitions session to processing then speaking", async () => {
      voiceTurn.begin();
      await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      expect(session.state).toBe("speaking");
    });

    it("passes history snapshot to LLM", async () => {
      const history = [{ role: "user" as const, content: "Hi" }];
      voiceTurn.begin();
      await voiceTurn.end(session, history, new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      const streamArgs = (llm.stream as ReturnType<typeof vi.fn>).mock.calls[0];
      const messages = streamArgs?.[0] as { role: string; content: string }[];
      expect(messages[0]?.content).toBe("Hi");
      expect(messages[messages.length - 1]?.content).toBe("Bonjour.");
    });
  });

  // --- end() error paths ---

  describe("end() — error paths", () => {
    it("returns err when STT finalize fails", async () => {
      const stream = makeFailSttStream(new Error("STT down"));
      voiceTurn = new ProcessVoiceTurn(makeStt(stream), llm, tts);
      voiceTurn.begin();
      const result = await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      expect(result.ok).toBe(false);
    });

    it("returns ok({transcript:'',agentReply:''}) for empty transcript", async () => {
      const stream = makeSttStream(""); // empty transcript
      voiceTurn = new ProcessVoiceTurn(makeStt(stream), llm, tts);
      voiceTurn.begin();
      const result = await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.transcript).toBe("");
    });

    it("returns err when LLM stream throws", async () => {
      llm = makeLlm([], new Error("LLM down"));
      voiceTurn = new ProcessVoiceTurn(makeStt(sttStream), llm, tts);
      voiceTurn.begin();
      const result = await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      expect(result.ok).toBe(false);
    });

    it("returns err when TTS synthesize fails", async () => {
      tts = makeTts(new Error("TTS down"));
      voiceTurn = new ProcessVoiceTurn(makeStt(sttStream), llm, tts);
      voiceTurn.begin();
      const result = await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      expect(result.ok).toBe(false);
    });

    it("returns err when end() called without begin()", async () => {
      const result = await voiceTurn.end(session, [], new AbortController().signal, {
        onTranscript: vi.fn(),
        onAudioChunk: vi.fn(),
      });
      expect(result.ok).toBe(false);
    });
  });

  // --- abort ---

  describe("abort()", () => {
    it("calls abort() on the active stream", () => {
      voiceTurn.begin();
      voiceTurn.abort();
      expect(sttStream.abort).toHaveBeenCalledOnce();
    });

    it("is a no-op when no stream is active", () => {
      expect(() => voiceTurn.abort()).not.toThrow();
    });

    it("after abort(), addChunk() is a no-op", () => {
      voiceTurn.begin();
      voiceTurn.abort();
      voiceTurn.addChunk(new ArrayBuffer(8));
      // stream.write should not have been called after abort
      expect(sttStream.write).not.toHaveBeenCalled();
    });
  });
});
