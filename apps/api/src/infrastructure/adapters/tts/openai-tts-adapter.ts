import OpenAI from "openai";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { TtsProviderPort } from "@/domain/ports/tts-provider-port";
import { env } from "@/config/env";

const MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "coral";

export interface OpenAITtsAdapterOptions {
  /** Prosody/personality instructions passed to gpt-4o-mini-tts. */
  instructions?: string;
}

export class OpenAITtsAdapter implements TtsProviderPort {
  private readonly client: OpenAI;
  private readonly instructions: string | undefined;

  constructor({ instructions }: OpenAITtsAdapterOptions = {}) {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.instructions = instructions;
  }

  async synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>> {
    try {
      const response = await this.client.audio.speech.create(
        {
          model: MODEL,
          voice: DEFAULT_VOICE,
          input: text,
          response_format: "mp3",
          ...(this.instructions && { instructions: this.instructions }),
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
