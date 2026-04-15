import { DeepgramClient, type Deepgram } from "@deepgram/sdk";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { SttProviderPort, SttStreamPort } from "@/domain/ports/stt-provider-port";
import { Transcript } from "@/domain/value-objects/transcript";
import { env } from "@/config/env";

/** Returns true if the buffer starts with the WAV/RIFF magic bytes. */
const isWav = (buf: ArrayBuffer): boolean => {
  if (buf.byteLength < 4) return false;
  const v = new Uint8Array(buf, 0, 4);
  return v[0] === 0x52 && v[1] === 0x49 && v[2] === 0x46 && v[3] === 0x46; // "RIFF"
};

/**
 * Buffered STT stream backed by Deepgram's batch transcription API.
 *
 * Audio chunks are accumulated locally; finalize() sends the merged buffer
 * as a single transcribeFile() request — the same proven approach as the
 * original one-shot adapter, wrapped in the SttStreamPort interface so the
 * adapter can be swapped for a true live-streaming implementation later.
 */
class DeepgramSttStream implements SttStreamPort {
  private chunks: ArrayBuffer[] = [];
  private aborted = false;

  constructor(
    private readonly client: DeepgramClient,
    private readonly language: string,
  ) {}

  write(chunk: ArrayBuffer): void {
    if (this.aborted) return;
    this.chunks.push(chunk);
  }

  async finalize(): Promise<Result<Transcript>> {
    if (this.aborted || this.chunks.length === 0) return ok(new Transcript(""));

    // Merge all accumulated chunks into one buffer
    const totalBytes = this.chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    this.chunks = [];

    const buffer = merged.buffer;

    try {
      const response = await this.client.listen.v1.media.transcribeFile(buffer, {
        model: "nova-3",
        language: this.language,
        smart_format: true,
        punctuate: true,
        // If the client sends a WAV, Deepgram reads the header automatically.
        // If it sends raw PCM (no RIFF header), we specify the encoding explicitly.
        ...(isWav(buffer) ? {} : { encoding: "linear16", sample_rate: 16000 }),
      });

      if (!("results" in response)) {
        return err(
          new Error("Deepgram returned an async response — synchronous transcription expected"),
        );
      }

      const syncResponse = response as Deepgram.ListenV1Response;
      const transcript = syncResponse.results.channels[0]?.alternatives?.[0]?.transcript ?? "";
      return ok(new Transcript(transcript));
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  abort(): void {
    this.aborted = true;
    this.chunks = [];
  }
}

export class DeepgramSttAdapter implements SttProviderPort {
  private readonly client: DeepgramClient;

  constructor() {
    this.client = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  }

  createStream(): SttStreamPort {
    return new DeepgramSttStream(this.client, env.AGENT_LANGUAGE ?? env.AGENT_LANGUAGE);
  }
}
