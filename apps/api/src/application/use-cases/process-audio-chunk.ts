import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { ISttProvider } from "@/domain/ports/i-stt-provider";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";
import type { ILlmProvider, LlmMessage } from "@/domain/ports/i-llm-provider";
import type { VoiceSession } from "@/domain/entities/voice-session";

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
    session.transition("processing");

    const transcriptResult = await this.stt.transcribe(audioChunk, signal);
    if (!transcriptResult.ok) return err(transcriptResult.error);

    const messages: LlmMessage[] = [
      ...history,
      { role: "user", content: transcriptResult.value.text },
    ];

    const llmResult = await this.llm.chat(messages, [], signal);
    if (!llmResult.ok) return err(llmResult.error);

    session.transition("speaking");

    const ttsResult = await this.tts.synthesize(llmResult.value, signal);
    if (!ttsResult.ok) return err(ttsResult.error);

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
