import type { Result } from "@call-cc/types";
import { err, ok } from "@call-cc/types";
import type { SttProviderPort, SttStreamPort } from "@/domain/ports/stt-provider-port";
import type { TtsProviderPort } from "@/domain/ports/tts-provider-port";
import type { LlmProviderPort, LlmMessage } from "@/domain/ports/llm-provider-port";
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
 *
 * Tag-aware: does not split on punctuation that appears inside SSML tags
 * (<speed ratio="0.5"/>, <break time="0.5s"/>) or inline audio tags ([laughs]).
 * If the buffer ends mid-tag, returns null and waits for more tokens.
 */
const extractSentence = (buffer: string): [string, string] | null => {
  let inAngle = false; // inside <...>
  let inBracket = false; // inside [...]

  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];

    if (!inAngle && !inBracket) {
      if (ch === "<") {
        inAngle = true;
      } else if (ch === "[") {
        inBracket = true;
      } else if (ch === "." || ch === "!" || ch === "?") {
        // Consume any trailing punctuation of the same kind (e.g. "...")
        let j = i + 1;
        while (j < buffer.length && (buffer[j] === "." || buffer[j] === "!" || buffer[j] === "?"))
          j++;
        // Only flush if followed by whitespace or end of buffer
        if (j >= buffer.length || buffer[j] === " " || buffer[j] === "\n") {
          const sentence = buffer.slice(0, j).trim();
          const remainder = buffer.slice(j).trimStart();
          return sentence.length > 0 ? [sentence, remainder] : null;
        }
      }
    } else if (inAngle && ch === ">") {
      inAngle = false;
    } else if (inBracket && ch === "]") {
      inBracket = false;
    }
  }

  return null;
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
export interface ProcessVoiceTurnDeps {
  stt: SttProviderPort;
  llm: LlmProviderPort;
  tts: TtsProviderPort;
  systemPrompt?: string;
}

export class ProcessVoiceTurn {
  private stream: SttStreamPort | null = null;
  private readonly stt: SttProviderPort;
  private readonly llm: LlmProviderPort;
  private readonly tts: TtsProviderPort;
  private readonly systemPrompt: string;

  constructor({ stt, llm, tts, systemPrompt = "" }: ProcessVoiceTurnDeps) {
    this.stt = stt;
    this.llm = llm;
    this.tts = tts;
    this.systemPrompt = systemPrompt;
  }

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
    const systemMessages: LlmMessage[] = this.systemPrompt
      ? [{ role: "system", content: this.systemPrompt }]
      : [];
    const messages: LlmMessage[] = [
      ...systemMessages,
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
