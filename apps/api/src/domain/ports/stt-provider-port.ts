import type { Result } from "@call-cc/types";
import type { Transcript } from "@/domain/value-objects/transcript";

/**
 * A single turn stream — opened once per user utterance.
 * Audio chunks are pushed as they arrive; finalize() is called when the VAD
 * signals end-of-speech and returns the complete transcript.
 */
export interface SttStreamPort {
  /** Push a raw audio chunk (ArrayBuffer) while the user is speaking. */
  write(chunk: ArrayBuffer): void;
  /** Signal end-of-speech. Flushes the stream and resolves with the transcript. */
  finalize(): Promise<Result<Transcript>>;
  /** Abort without result (barge-in / connection close). */
  abort(): void;
}

/**
 * STT provider port.
 * Each call to createStream() opens a new turn stream.
 * Providers can implement streaming (Deepgram live) or buffered (Groq Whisper).
 */
export interface SttProviderPort {
  createStream(): SttStreamPort;
}
