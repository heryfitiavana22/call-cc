import Groq from "groq-sdk";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { ISttProvider, ISttStream } from "@/domain/ports/i-stt-provider";
import { Transcript } from "@/domain/value-objects/transcript";
import { env } from "@/config/env";

/**
 * Buffered STT stream backed by Groq's Whisper API.
 *
 * - Audio chunks are buffered locally until finalize() is called.
 * - finalize() sends the full buffer to Groq (whisper-large-v3-turbo) in one shot.
 * - Groq inference is very fast (~10–50ms for short utterances) so the latency
 *   difference vs streaming is negligible for typical voice turns.
 */
class GroqSttStream implements ISttStream {
  private chunks: Buffer[] = [];
  private aborted = false;

  constructor(
    private readonly client: Groq,
    private readonly language: string,
  ) {}

  write(chunk: ArrayBuffer): void {
    if (this.aborted) return;
    this.chunks.push(Buffer.from(chunk));
  }

  async finalize(): Promise<Result<Transcript>> {
    if (this.aborted) return ok(new Transcript(""));
    if (this.chunks.length === 0) return ok(new Transcript(""));

    const buffer = Buffer.concat(this.chunks);
    this.chunks = [];

    try {
      // Groq expects a File-like object. We create one from the buffer.
      const file = new File([buffer], "audio.wav", { type: "audio/wav" });

      const response = await this.client.audio.transcriptions.create({
        file,
        model: "whisper-large-v3-turbo",
        // "multi" is Deepgram-specific — pass no language to let Groq auto-detect
        ...(this.language !== "multi" && { language: this.language }),
        response_format: "json",
      });

      return ok(new Transcript(response.text ?? ""));
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  abort(): void {
    this.aborted = true;
    this.chunks = [];
  }
}

export class GroqSttAdapter implements ISttProvider {
  private readonly client: Groq;
  private readonly language: string;

  constructor() {
    this.client = new Groq({ apiKey: env.GROQ_API_KEY });
    this.language = env.DEEPGRAM_LANGUAGE; // reuse same BCP-47 language setting
  }

  createStream(): ISttStream {
    return new GroqSttStream(this.client, this.language);
  }
}
