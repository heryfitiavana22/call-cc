import { DeepgramClient, type Deepgram } from "@deepgram/sdk";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { ISttProvider } from "@/domain/ports/i-stt-provider";
import { Transcript } from "@/domain/value-objects/transcript";
import { env } from "@/config/env";

export class DeepgramSttAdapter implements ISttProvider {
  private readonly client: DeepgramClient;

  constructor() {
    this.client = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  }

  async transcribe(audioBuffer: ArrayBuffer, signal: AbortSignal): Promise<Result<Transcript>> {
    try {
      const response = await this.client.listen.v1.media.transcribeFile(
        audioBuffer,
        {
          model: "nova-3",
          smart_format: true,
        },
        { abortSignal: signal },
      );

      // response is ListenV1Response | ListenV1AcceptedResponse
      // ListenV1AcceptedResponse is for async callback requests (no results)
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
}
