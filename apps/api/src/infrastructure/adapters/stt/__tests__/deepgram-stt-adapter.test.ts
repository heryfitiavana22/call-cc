import { describe, it, expect } from "vitest";
import { DeepgramSttAdapter } from "@/infrastructure/adapters/stt/deepgram-stt-adapter";
import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a valid WAV buffer containing pure silence (PCM 16-bit, mono, 16kHz).
 */
const createSilenceWav = (durationMs: number, sampleRate = 16000): ArrayBuffer => {
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true);
  view.setUint16(32, (numChannels * bitsPerSample) / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  return buffer;
};

// ---------------------------------------------------------------------------
// Tests — skipped when no real Deepgram key is configured
// ---------------------------------------------------------------------------

const hasRealKey = !!env.DEEPGRAM_API_KEY && env.DEEPGRAM_API_KEY !== "test-key";

describe.skipIf(!hasRealKey)("DeepgramSttAdapter (integration)", () => {
  const adapter = new DeepgramSttAdapter();

  it("stream: returns ok(Transcript) for silence — transcript is empty", async () => {
    const wav = createSilenceWav(500);
    const stream = adapter.createStream();
    stream.write(wav);
    const result = await stream.finalize();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isEmpty).toBe(true);
  }, 15_000);

  it("stream: result.value has text and isFinal properties", async () => {
    const wav = createSilenceWav(500);
    const stream = adapter.createStream();
    stream.write(wav);
    const result = await stream.finalize();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value.text).toBe("string");
    expect(typeof result.value.isFinal).toBe("boolean");
  }, 15_000);

  it("stream: abort() resolves finalize gracefully without throwing", async () => {
    const wav = createSilenceWav(500);
    const stream = adapter.createStream();
    stream.write(wav);
    stream.abort();

    // After abort, finalize should either have already resolved or resolve immediately
    // with an empty transcript — no throw
    await expect(stream.finalize()).resolves.toBeDefined();
  }, 5_000);
});
