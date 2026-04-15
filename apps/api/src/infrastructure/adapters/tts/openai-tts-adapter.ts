import OpenAI from "openai";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { ITtsProvider } from "@/domain/ports/i-tts-provider";
import { env } from "@/config/env";

const DEFAULT_MODEL = "tts-1";
const DEFAULT_VOICE = "alloy";

export class OpenAITtsAdapter implements ITtsProvider {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>> {
    try {
      const response = await this.client.audio.speech.create(
        {
          model: DEFAULT_MODEL,
          voice: DEFAULT_VOICE,
          input: text,
          response_format: "mp3",
        },
        { signal },
      );

      const arrayBuffer = await response.arrayBuffer();
      return ok(arrayBuffer);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
