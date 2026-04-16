import { Cartesia } from "@cartesia/cartesia-js";
import type { SupportedLanguage } from "@cartesia/cartesia-js/resources/voices.js";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { TtsProviderPort } from "@/domain/ports/tts-provider-port";

/** sonic-2 — fast, multilingual, stable production model. */
const MODEL = "sonic-3";

export interface CartesiaTtsAdapterOptions {
  voiceId: string;
  /** BCP-47 language code, e.g. "fr", "en". Defaults to "fr". */
  language?: string;
}

export class CartesiaTtsAdapter implements TtsProviderPort {
  private readonly client: Cartesia;
  private readonly voiceId: string;
  private readonly language: SupportedLanguage | null;

  constructor(apiKey: string, { voiceId, language = "fr" }: CartesiaTtsAdapterOptions) {
    this.client = new Cartesia({ apiKey });
    this.voiceId = voiceId;
    this.language = language as SupportedLanguage;
  }

  async synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>> {
    try {
      const response = await this.client.tts.generate(
        {
          model_id: MODEL,
          transcript: text,
          voice: { mode: "id", id: this.voiceId },
          // MP3 128kbps — good balance of size and quality for voice
          output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
          language: this.language,
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
