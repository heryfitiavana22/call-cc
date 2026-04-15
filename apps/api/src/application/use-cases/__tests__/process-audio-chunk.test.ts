import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "@call-cc/types";
import {
  ProcessAudioChunk,
  type ProcessAudioChunkCallbacks,
} from "@/application/use-cases/process-audio-chunk";
import type { ISttProvider } from "@/domain/ports/i-stt-provider";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";
import type { ILlmProvider, LlmMessage } from "@/domain/ports/i-llm-provider";
import { VoiceSession } from "@/domain/entities/voice-session";
import { Transcript } from "@/domain/value-objects/transcript";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSession = (state: "listening" | "processing" | "speaking" = "listening") => {
  const s = new VoiceSession("test-session");
  s.transition(state);
  return s;
};

const makeAudio = (): ArrayBuffer => new ArrayBuffer(16);

const makeCallbacks = (): ProcessAudioChunkCallbacks & {
  onTranscriptMock: ReturnType<typeof vi.fn>;
  onAudioChunkMock: ReturnType<typeof vi.fn>;
} => {
  const onTranscriptMock = vi.fn();
  const onAudioChunkMock = vi.fn();
  return {
    onTranscript: onTranscriptMock,
    onAudioChunk: onAudioChunkMock,
    onTranscriptMock,
    onAudioChunkMock,
  };
};

/** Creates a mock LLM that yields the provided tokens in order. */
const mockLlmTokens = (tokens: string[]): ILlmProvider => ({
  stream: vi.fn().mockImplementation(
    // eslint-disable-next-line require-yield
    async function* (): AsyncGenerator<string, void> {
      for (const token of tokens) yield token;
    },
  ),
});

/** Creates a mock LLM that throws on first iteration. */
const mockLlmThrows = (error: Error): ILlmProvider => ({
  stream: vi.fn().mockImplementation(async function* (): AsyncGenerator<string, void> {
    throw error;
    // eslint-disable-next-line no-unreachable
    yield ""; // keeps TS happy about the return type
  }),
});

const mockStt = (transcript: string): ISttProvider => ({
  transcribe: vi.fn().mockResolvedValue(ok(new Transcript(transcript))),
});

const mockSttFails = (error = new Error("STT error")): ISttProvider => ({
  transcribe: vi.fn().mockResolvedValue(err(error)),
});

const mockTts = (audio = makeAudio()): ITtsProvider => ({
  synthesize: vi.fn().mockResolvedValue(ok(audio)),
});

const mockTtsFails = (error = new Error("TTS error")): ITtsProvider => ({
  synthesize: vi.fn().mockResolvedValue(err(error)),
});

const signal = () => new AbortController().signal;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProcessAudioChunk", () => {
  // --- STT failures ---

  describe("when STT fails", () => {
    it("returns err with the STT error", async () => {
      const sttError = new Error("Deepgram unreachable");
      const useCase = new ProcessAudioChunk(mockSttFails(sttError), mockLlmTokens([]), mockTts());
      const cb = makeCallbacks();

      const result = await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe(sttError);
    });

    it("does not call onTranscript or onAudioChunk", async () => {
      const useCase = new ProcessAudioChunk(mockSttFails(), mockLlmTokens([]), mockTts());
      const cb = makeCallbacks();

      await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(cb.onTranscriptMock).not.toHaveBeenCalled();
      expect(cb.onAudioChunkMock).not.toHaveBeenCalled();
    });
  });

  // --- Empty transcript ---

  describe("when STT returns an empty transcript", () => {
    it("returns ok with empty transcript and agentReply", async () => {
      const useCase = new ProcessAudioChunk(mockStt(""), mockLlmTokens([]), mockTts());
      const cb = makeCallbacks();

      const result = await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.transcript).toBe("");
      expect(result.value.agentReply).toBe("");
    });

    it("does not call LLM or TTS", async () => {
      const llm = mockLlmTokens([]);
      const tts = mockTts();
      const useCase = new ProcessAudioChunk(mockStt(""), llm, tts);

      await useCase.execute(makeSession(), makeAudio(), [], signal(), makeCallbacks());

      expect(llm.stream).not.toHaveBeenCalled();
      expect(tts.synthesize).not.toHaveBeenCalled();
    });

    it("does not call onTranscript or onAudioChunk", async () => {
      const useCase = new ProcessAudioChunk(mockStt(""), mockLlmTokens([]), mockTts());
      const cb = makeCallbacks();

      await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(cb.onTranscriptMock).not.toHaveBeenCalled();
      expect(cb.onAudioChunkMock).not.toHaveBeenCalled();
    });
  });

  // --- Happy path ---

  describe("happy path — single sentence", () => {
    it("calls onTranscript with the STT text", async () => {
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmTokens(["Salut!"]),
        mockTts(),
      );
      const cb = makeCallbacks();

      await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(cb.onTranscriptMock).toHaveBeenCalledWith("Bonjour.");
    });

    it("returns ok with transcript and full agentReply", async () => {
      const useCase = new ProcessAudioChunk(
        mockStt("Qui es-tu?"),
        mockLlmTokens(["Je suis", " ton assistant."]),
        mockTts(),
      );

      const result = await useCase.execute(
        makeSession(),
        makeAudio(),
        [],
        signal(),
        makeCallbacks(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.transcript).toBe("Qui es-tu?");
      expect(result.value.agentReply).toBe("Je suis ton assistant.");
    });

    it("calls TTS once for the sentence", async () => {
      const tts = mockTts();
      const useCase = new ProcessAudioChunk(mockStt("Bonjour."), mockLlmTokens(["Salut!"]), tts);

      await useCase.execute(makeSession(), makeAudio(), [], signal(), makeCallbacks());

      expect(tts.synthesize).toHaveBeenCalledTimes(1);
      expect(tts.synthesize).toHaveBeenCalledWith("Salut!", expect.any(AbortSignal));
    });

    it("calls onAudioChunk once with the TTS audio", async () => {
      const audio = new ArrayBuffer(32);
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmTokens(["Salut!"]),
        mockTts(audio),
      );
      const cb = makeCallbacks();

      await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(cb.onAudioChunkMock).toHaveBeenCalledTimes(1);
      expect(cb.onAudioChunkMock).toHaveBeenCalledWith(audio);
    });

    it("transitions session to processing then speaking", async () => {
      const session = makeSession();
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmTokens(["Salut!"]),
        mockTts(),
      );

      await useCase.execute(session, makeAudio(), [], signal(), makeCallbacks());

      // After execute the caller (AudioStreamHandler) transitions to listening —
      // here we only verify that speaking was reached at some point during execution.
      // The session ends in speaking because execute() does not reset it.
      expect(session.state).toBe("speaking");
    });
  });

  // --- Multiple sentences ---

  describe("happy path — multiple sentences from LLM stream", () => {
    it("calls TTS once per extracted sentence", async () => {
      const tts = mockTts();
      const useCase = new ProcessAudioChunk(
        mockStt("Raconte."),
        mockLlmTokens(["Il était une fois.", " Une fée magique.", " Fin."]),
        tts,
      );

      await useCase.execute(makeSession(), makeAudio(), [], signal(), makeCallbacks());

      expect(tts.synthesize).toHaveBeenCalledTimes(3);
    });

    it("calls onAudioChunk once per sentence", async () => {
      const useCase = new ProcessAudioChunk(
        mockStt("Raconte."),
        mockLlmTokens(["Il était une fois.", " Une fée magique.", " Fin."]),
        mockTts(),
      );
      const cb = makeCallbacks();

      await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(cb.onAudioChunkMock).toHaveBeenCalledTimes(3);
    });

    it("assembles the full agentReply from all tokens", async () => {
      const tokens = ["Première phrase.", " Deuxième phrase."];
      const useCase = new ProcessAudioChunk(mockStt("Ok."), mockLlmTokens(tokens), mockTts());

      const result = await useCase.execute(
        makeSession(),
        makeAudio(),
        [],
        signal(),
        makeCallbacks(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.agentReply).toBe("Première phrase. Deuxième phrase.");
    });
  });

  // --- Tail text (no terminating punctuation) ---

  describe("tail text — LLM response without terminal punctuation", () => {
    it("synthesizes the remaining buffer after the stream ends", async () => {
      const tts = mockTts();
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmTokens(["Salut sans ponctuation"]),
        tts,
      );

      await useCase.execute(makeSession(), makeAudio(), [], signal(), makeCallbacks());

      expect(tts.synthesize).toHaveBeenCalledWith(
        "Salut sans ponctuation",
        expect.any(AbortSignal),
      );
    });

    it("calls onAudioChunk for the tail", async () => {
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmTokens(["Salut sans ponctuation"]),
        mockTts(),
      );
      const cb = makeCallbacks();

      await useCase.execute(makeSession(), makeAudio(), [], signal(), cb);

      expect(cb.onAudioChunkMock).toHaveBeenCalledTimes(1);
    });

    it("does not call TTS for whitespace-only tail", async () => {
      const tts = mockTts();
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmTokens(["Une phrase complète.   "]),
        tts,
      );

      await useCase.execute(makeSession(), makeAudio(), [], signal(), makeCallbacks());

      // The sentence "Une phrase complète." is extracted → 1 TTS call.
      // The tail "   " is whitespace-only → no additional call.
      expect(tts.synthesize).toHaveBeenCalledTimes(1);
    });
  });

  // --- TTS failure ---

  describe("when TTS fails", () => {
    it("returns err with the TTS error", async () => {
      const ttsError = new Error("OpenAI TTS down");
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmTokens(["Salut!"]),
        mockTtsFails(ttsError),
      );

      const result = await useCase.execute(
        makeSession(),
        makeAudio(),
        [],
        signal(),
        makeCallbacks(),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe(ttsError);
    });
  });

  // --- LLM failure ---

  describe("when LLM stream throws", () => {
    it("returns err", async () => {
      const llmError = new Error("LLM unavailable");
      const useCase = new ProcessAudioChunk(
        mockStt("Bonjour."),
        mockLlmThrows(llmError),
        mockTts(),
      );

      const result = await useCase.execute(
        makeSession(),
        makeAudio(),
        [],
        signal(),
        makeCallbacks(),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe("LLM unavailable");
    });
  });

  // --- Conversation history ---

  describe("conversation history", () => {
    it("passes existing history to the LLM", async () => {
      const llm = mockLlmTokens(["Réponse."]);
      const useCase = new ProcessAudioChunk(mockStt("Nouvelle question."), llm, mockTts());
      const history: LlmMessage[] = [
        { role: "user", content: "Question précédente" },
        { role: "assistant", content: "Réponse précédente" },
      ];

      await useCase.execute(makeSession(), makeAudio(), history, signal(), makeCallbacks());

      const callArgs = (llm.stream as ReturnType<typeof vi.fn>).mock.calls[0];
      const messagesArg: LlmMessage[] = callArgs[0];

      // History + new user message
      expect(messagesArg).toHaveLength(3);
      expect(messagesArg[0]).toEqual({ role: "user", content: "Question précédente" });
      expect(messagesArg[1]).toEqual({ role: "assistant", content: "Réponse précédente" });
      expect(messagesArg[2]).toEqual({ role: "user", content: "Nouvelle question." });
    });

    it("does not mutate the history array passed in", async () => {
      const useCase = new ProcessAudioChunk(
        mockStt("Question."),
        mockLlmTokens(["Réponse."]),
        mockTts(),
      );
      const history: LlmMessage[] = [{ role: "user", content: "Ancien message" }];
      const originalLength = history.length;

      await useCase.execute(makeSession(), makeAudio(), history, signal(), makeCallbacks());

      expect(history).toHaveLength(originalLength);
    });
  });
});
