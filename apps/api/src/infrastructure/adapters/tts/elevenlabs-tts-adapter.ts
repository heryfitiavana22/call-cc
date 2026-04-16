import { ElevenLabsClient } from "elevenlabs";
import type { Readable } from "node:stream";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { TtsProviderPort } from "@/domain/ports/tts-provider-port";

/**
 * eleven_v3 — most expressive model, supports inline audio tags ([laughs], [whispers], etc.).
 * Higher latency than Flash v2.5 but required for audio tag support.
 */
const MODEL = "eleven_v3"; // eleven_flash_v2_5 ; eleven_v3

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
          model_id: MODEL,
          output_format: "mp3_44100_128",
        },
        { abortSignal: signal },
      );

      const arrayBuffer = await ElevenLabsTtsAdapter.readableToArrayBuffer(stream as Readable);
      return ok(arrayBuffer);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private static async readableToArrayBuffer(stream: Readable): Promise<ArrayBuffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    const buf = Buffer.concat(chunks);
    // Buffer.buffer may be a shared backing store — slice to get a standalone ArrayBuffer
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
}
