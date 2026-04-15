import type { Result } from "@call-cc/types";
import type { Transcript } from "../value-objects/transcript.js";

export interface ISttProvider {
  transcribe(audioChunk: ArrayBuffer, signal: AbortSignal): Promise<Result<Transcript>>;
}
