import type { Result } from "@call-cc/types";
import type { Transcript } from "@/domain/value-objects/transcript";

export interface ISttProvider {
  transcribe(audioChunk: ArrayBuffer, signal: AbortSignal): Promise<Result<Transcript>>;
}
