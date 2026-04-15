import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { ISttProvider } from "@/domain/ports/i-stt-provider";
import type { Transcript } from "@/domain/value-objects/transcript";

export class OpenAIWhisperSttAdapter implements ISttProvider {
  async transcribe(audioChunk: ArrayBuffer, signal: AbortSignal): Promise<Result<Transcript>> {
    // TODO: implement OpenAI Whisper batch transcription
    void audioChunk;
    void signal;
    return err(new Error("OpenAIWhisperSttAdapter not yet implemented"));
  }
}
