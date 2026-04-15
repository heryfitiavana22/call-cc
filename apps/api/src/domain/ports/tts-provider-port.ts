import type { Result } from "@call-cc/types";

export interface TtsProviderPort {
  synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>>;
}
