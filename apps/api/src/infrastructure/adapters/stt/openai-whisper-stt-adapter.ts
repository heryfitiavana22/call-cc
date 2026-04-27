import type { SttProviderPort, SttStreamPort } from "@/domain/ports/stt-provider-port";
import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { Transcript } from "@/domain/value-objects/transcript";

class OpenAIWhisperSttStream implements SttStreamPort {
  constructor() {
    throw new Error("OpenAIWhisperSttAdapter not yet implemented");
  }

  write(_chunk: ArrayBuffer): void {
    throw new Error("OpenAIWhisperSttAdapter not yet implemented");
  }

  finalize(): Promise<Result<Transcript>> {
    return Promise.resolve(err(new Error("OpenAIWhisperSttAdapter not yet implemented")));
  }

  abort(): void {
    throw new Error("OpenAIWhisperSttAdapter not yet implemented");
  }
}

export class OpenAIWhisperSttAdapter implements SttProviderPort {
  createStream(): SttStreamPort {
    return new OpenAIWhisperSttStream();
  }
}
