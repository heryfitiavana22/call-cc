import type { Result } from "@call-cc/types";
import { err, ok } from "@call-cc/types";
import type { ISttProvider, ISttStream } from "@/domain/ports/i-stt-provider";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";
import type { ILlmProvider, LlmMessage } from "@/domain/ports/i-llm-provider";
import type { VoiceSession } from "@/domain/entities/voice-session";
import { logger } from "@/shared/logger";

export interface ProcessVoiceTurnResult {
  transcript: string;
  agentReply: string;
}

export interface ProcessVoiceTurnCallbacks {
  /** Called once the transcript is known (after STT finalize). */
  onTranscript: (text: string) => void;
  /** Called for each synthesized sentence as soon as it is ready. */
  onAudioChunk: (audio: ArrayBuffer) => void;
}

/**
 * Extracts the first complete sentence from the buffer.
 * Returns [sentence, remainder] or null if no complete sentence yet.
 */
const extractSentence = (buffer: string): [string, string] | null => {
  const match = buffer.match(/^(.*?[.!?]+)(\s+|$)(.*)/s);
  if (!match) return null;
  const sentence = match[1]?.trim() ?? "";
  const remainder = match[3] ?? "";
  return sentence.length > 0 ? [sentence, remainder] : null;
};

/**
 * Stateful application service — one instance per WebSocket connection.
 *
 * Lifecycle per user utterance:
 *   begin()            → opens an STT stream (streaming starts immediately)
 *   addChunk(chunk)    → forwards audio to the STT stream while user speaks
 *   end(...)           → finalizes STT, then runs LLM → TTS pipeline
 *   abort()            → discards current stream (barge-in / disconnection)
 */
export class ProcessVoiceTurn {
  private stream: ISttStream | null = null;

  constructor(
    private readonly stt: ISttProvider,
    private readonly llm: ILlmProvider,
    private readonly tts: ITtsProvider,
  ) {}

  /** Open a new STT stream. Call once per utterance, before addChunk(). */
  begin(): void {
    this.stream = this.stt.createStream();
  }

  /** Forward an audio chunk to the active STT stream. */
  addChunk(chunk: ArrayBuffer): void {
    this.stream?.write(chunk);
  }

  /** Finalize STT then run LLM → TTS. Returns when all audio has been emitted. */
  async end(
    session: VoiceSession,
    history: LlmMessage[],
    signal: AbortSignal,
    callbacks: ProcessVoiceTurnCallbacks,
  ): Promise<Result<ProcessVoiceTurnResult>> {
    const stream = this.stream;
    this.stream = null;

    if (!stream) {
      return err(new Error("No active STT stream — call begin() first"));
    }

    const sessionId = session.id;
    session.transition("processing");

    // STT finalize
    const sttStart = performance.now();
    const transcriptResult = await stream.finalize();
    const sttMs = Math.round(performance.now() - sttStart);

    if (!transcriptResult.ok) {
      logger.error({ sessionId, err: transcriptResult.error, sttMs }, "STT failed");
      return err(transcriptResult.error);
    }

    if (transcriptResult.value.isEmpty) {
      logger.info({ sessionId, sttMs }, "STT returned empty transcript — skipping");
      return ok({ transcript: "", agentReply: "" });
    }

    logger.info({ sessionId, transcript: transcriptResult.value.text, sttMs }, "STT completed");
    callbacks.onTranscript(transcriptResult.value.text);

    // LLM stream → sentence-level TTS
    const messages: LlmMessage[] = [
      ...history,
      { role: "user", content: transcriptResult.value.text },
    ];

    let agentReply = "";
    let buffer = "";
    const llmStart = performance.now();

    try {
      for await (const token of this.llm.stream(messages, [], signal)) {
        agentReply += token;
        buffer += token;

        let extracted = extractSentence(buffer);
        while (extracted !== null) {
          const [sentence, remainder] = extracted;
          buffer = remainder;

          session.transition("speaking");
          const ttsStart = performance.now();
          const ttsResult = await this.tts.synthesize(sentence, signal);
          const ttsMs = Math.round(performance.now() - ttsStart);

          if (!ttsResult.ok) {
            logger.error({ sessionId, err: ttsResult.error, ttsMs }, "TTS failed");
            return err(ttsResult.error);
          }

          logger.info({ sessionId, sentence, ttsMs }, "TTS sentence streamed");
          callbacks.onAudioChunk(ttsResult.value);

          extracted = extractSentence(buffer);
        }
      }
    } catch (e) {
      const llmMs = Math.round(performance.now() - llmStart);
      logger.error({ sessionId, err: e, llmMs }, "LLM stream failed");
      return err(e instanceof Error ? e : new Error(String(e)));
    }

    const llmMs = Math.round(performance.now() - llmStart);
    logger.info({ sessionId, llmMs }, "LLM stream completed");

    // Synthesize any remaining text that didn't end with punctuation
    if (buffer.trim().length > 0) {
      const ttsStart = performance.now();
      const ttsResult = await this.tts.synthesize(buffer.trim(), signal);
      const ttsMs = Math.round(performance.now() - ttsStart);

      if (!ttsResult.ok) {
        logger.error({ sessionId, err: ttsResult.error, ttsMs }, "TTS failed (tail)");
        return err(ttsResult.error);
      }

      logger.info({ sessionId, sentence: buffer.trim(), ttsMs }, "TTS tail streamed");
      callbacks.onAudioChunk(ttsResult.value);
    }

    return ok({ transcript: transcriptResult.value.text, agentReply });
  }

  /** Abort the current stream (barge-in or connection close). */
  abort(): void {
    this.stream?.abort();
    this.stream = null;
  }
}
