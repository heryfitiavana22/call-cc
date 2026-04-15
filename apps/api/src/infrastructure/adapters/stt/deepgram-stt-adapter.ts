import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { ISttProvider } from "../../../domain/ports/i-stt-provider.js";
import { Transcript } from "../../../domain/value-objects/transcript.js";

export class DeepgramSttAdapter implements ISttProvider {
  async transcribe(audioChunk: ArrayBuffer, signal: AbortSignal): Promise<Result<Transcript>> {
    // TODO: implement Deepgram streaming transcription
    void audioChunk;
    void signal;
    return err(new Error("DeepgramSttAdapter not yet implemented"));
  }
}
