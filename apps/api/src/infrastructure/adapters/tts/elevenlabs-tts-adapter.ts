import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { TtsProviderPort } from "@/domain/ports/tts-provider-port";

export class ElevenLabsTtsAdapter implements TtsProviderPort {
  async synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>> {
    // TODO: implement ElevenLabs TTS speech synthesis
    void text;
    void signal;
    return err(new Error("ElevenLabsTtsAdapter not yet implemented"));
  }
}
