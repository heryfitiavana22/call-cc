import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { ISttProvider } from "@/domain/ports/i-stt-provider";
import { Transcript } from "@/domain/value-objects/transcript";

export class DeepgramSttAdapter implements ISttProvider {
  async transcribe(audioChunk: ArrayBuffer, signal: AbortSignal): Promise<Result<Transcript>> {
    // TODO: implement Deepgram real-time streaming transcription
    void audioChunk;
    void signal;
    return err(new Error("DeepgramSttAdapter not yet implemented"));
  }
}
