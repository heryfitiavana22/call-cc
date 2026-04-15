import type { ISttProvider, ISttStream } from "@/domain/ports/i-stt-provider";
import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { Transcript } from "@/domain/value-objects/transcript";

class OpenAIWhisperSttStream implements ISttStream {
  write(_chunk: ArrayBuffer): void {}

  finalize(): Promise<Result<Transcript>> {
    return Promise.resolve(err(new Error("OpenAIWhisperSttAdapter not yet implemented")));
  }

  abort(): void {}
}

export class OpenAIWhisperSttAdapter implements ISttProvider {
  createStream(): ISttStream {
    return new OpenAIWhisperSttStream();
  }
}
