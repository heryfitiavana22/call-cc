import type { SttProviderPort, SttStreamPort } from "@/domain/ports/stt-provider-port";
import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { Transcript } from "@/domain/value-objects/transcript";

class OpenAIWhisperSttStream implements SttStreamPort {
  write(_chunk: ArrayBuffer): void {}

  finalize(): Promise<Result<Transcript>> {
    return Promise.resolve(err(new Error("OpenAIWhisperSttAdapter not yet implemented")));
  }

  abort(): void {}
}

export class OpenAIWhisperSttAdapter implements SttProviderPort {
  createStream(): SttStreamPort {
    return new OpenAIWhisperSttStream();
  }
}
