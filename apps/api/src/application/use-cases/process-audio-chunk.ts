import type { Result } from "@call-cc/types";
import { err, ok } from "@call-cc/types";
import type { ISttProvider } from "@/domain/ports/i-stt-provider";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";
import type { ILlmProvider, LlmMessage } from "@/domain/ports/i-llm-provider";
import type { VoiceSession } from "@/domain/entities/voice-session";
import { logger } from "@/shared/logger";

export interface ProcessAudioChunkResult {
  transcript: string;
  agentReply: string;
  // Audio is streamed via onAudioChunk callback — not returned here
}

export interface ProcessAudioChunkCallbacks {
  /** Called for each synthesized sentence as soon as it is ready. */
  onAudioChunk: (audio: ArrayBuffer) => void;
  /** Called once the transcript is known (after STT). */
  onTranscript: (text: string) => void;
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

export class ProcessAudioChunk {
  constructor(
    private readonly stt: ISttProvider,
    private readonly llm: ILlmProvider,
    private readonly tts: ITtsProvider,
  ) {}

  async execute(
    session: VoiceSession,
    audioBuffer: ArrayBuffer,
    history: LlmMessage[],
    signal: AbortSignal,
    callbacks: ProcessAudioChunkCallbacks,
  ): Promise<Result<ProcessAudioChunkResult>> {
    const sessionId = session.id;
    session.transition("processing");

    // STT
    const sttStart = performance.now();
    const transcriptResult = await this.stt.transcribe(audioBuffer, signal);
    const sttMs = Math.round(performance.now() - sttStart);

    if (!transcriptResult.ok) {
      logger.error({ sessionId, err: transcriptResult.error, sttMs }, "STT failed");
      return err(transcriptResult.error);
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

        // Try to extract a complete sentence and synthesize it immediately
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
    logger.info({ sessionId, llmMs, sentences: agentReply.length }, "LLM stream completed");

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
}
