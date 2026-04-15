import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { ISttProvider } from "@/domain/ports/i-stt-provider";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";
import type { ILlmProvider, LlmMessage } from "@/domain/ports/i-llm-provider";
import type { VoiceSession } from "@/domain/entities/voice-session";
import { logger } from "@/shared/logger";

export interface ProcessAudioChunkResult {
  transcript: string;
  agentReply: string;
  audioResponse: ArrayBuffer;
}

export class ProcessAudioChunk {
  constructor(
    private readonly stt: ISttProvider,
    private readonly llm: ILlmProvider,
    private readonly tts: ITtsProvider,
  ) {}

  async execute(
    session: VoiceSession,
    audioChunk: ArrayBuffer,
    history: LlmMessage[],
    signal: AbortSignal,
  ): Promise<Result<ProcessAudioChunkResult>> {
    const sessionId = session.id;
    session.transition("processing");

    // STT
    const sttStart = performance.now();
    const transcriptResult = await this.stt.transcribe(audioChunk, signal);
    const sttMs = Math.round(performance.now() - sttStart);

    if (!transcriptResult.ok) {
      logger.error({ sessionId, err: transcriptResult.error, sttMs }, "STT failed");
      return err(transcriptResult.error);
    }

    logger.info({ sessionId, transcript: transcriptResult.value.text, sttMs }, "STT completed");

    // LLM
    const messages: LlmMessage[] = [
      ...history,
      { role: "user", content: transcriptResult.value.text },
    ];

    const llmStart = performance.now();
    const llmResult = await this.llm.chat(messages, [], signal);
    const llmMs = Math.round(performance.now() - llmStart);

    if (!llmResult.ok) {
      logger.error({ sessionId, err: llmResult.error, llmMs }, "LLM failed");
      return err(llmResult.error);
    }

    logger.info({ sessionId, reply: llmResult.value, llmMs }, "LLM completed");
    session.transition("speaking");

    // TTS
    const ttsStart = performance.now();
    const ttsResult = await this.tts.synthesize(llmResult.value, signal);
    const ttsMs = Math.round(performance.now() - ttsStart);

    if (!ttsResult.ok) {
      logger.error({ sessionId, err: ttsResult.error, ttsMs }, "TTS failed");
      return err(ttsResult.error);
    }

    logger.info({ sessionId, audioBytes: ttsResult.value.byteLength, ttsMs }, "TTS completed");

    return {
      ok: true,
      value: {
        transcript: transcriptResult.value.text,
        agentReply: llmResult.value,
        audioResponse: ttsResult.value,
      },
    };
  }
}
