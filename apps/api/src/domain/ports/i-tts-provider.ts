import type { Result } from "@call-cc/types";

export interface ITtsProvider {
  synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>>;
}
