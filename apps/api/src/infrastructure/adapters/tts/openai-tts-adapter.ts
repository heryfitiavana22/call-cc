import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";

export class OpenAITtsAdapter implements ITtsProvider {
  async synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>> {
    // TODO: implement OpenAI TTS speech synthesis
    void text;
    void signal;
    return err(new Error("OpenAITtsAdapter not yet implemented"));
  }
}
