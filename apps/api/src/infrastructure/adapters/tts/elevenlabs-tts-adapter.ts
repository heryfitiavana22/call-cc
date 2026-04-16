import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { TtsProviderPort } from "@/domain/ports/tts-provider-port";

/**
 * eleven_v3 — most expressive model, supports inline audio tags ([laughs], [whispers], etc.).
 * Higher latency than Flash v2.5 but required for audio tag support.
 */
const MODEL = "eleven_v3";

export interface ElevenLabsTtsAdapterOptions {
  voiceId: string;
}

export class ElevenLabsTtsAdapter implements TtsProviderPort {
  private readonly client: ElevenLabsClient;
  private readonly voiceId: string;

  constructor(apiKey: string, { voiceId }: ElevenLabsTtsAdapterOptions) {
    this.client = new ElevenLabsClient({ apiKey });
    this.voiceId = voiceId;
  }

  async synthesize(text: string, signal: AbortSignal): Promise<Result<ArrayBuffer>> {
    try {
      const stream = await this.client.textToSpeech.convert(
        this.voiceId,
        {
          text,
          modelId: MODEL,
          outputFormat: "mp3_44100_128",
        },
        { abortSignal: signal },
      );

      // ReadableStream<Uint8Array> → ArrayBuffer via the Web Streams Response helper
      const arrayBuffer = await new Response(stream).arrayBuffer();
      return ok(arrayBuffer);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
