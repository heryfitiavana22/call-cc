import { describe, it, expect } from "vitest";
import { OpenAITtsAdapter } from "@/infrastructure/adapters/tts/openai-tts-adapter";
import { env } from "@/config/env";

const hasRealKey = env.OPENAI_API_KEY !== "test-key";

describe.skipIf(!hasRealKey)("OpenAITtsAdapter (integration)", () => {
  const adapter = new OpenAITtsAdapter();

  it("returns ok(ArrayBuffer) with audio bytes for a short text", async () => {
    const result = await adapter.synthesize("Bonjour.", new AbortController().signal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(ArrayBuffer);
    // A real mp3 for "Bonjour." is at least a few hundred bytes
    expect(result.value.byteLength).toBeGreaterThan(100);
  }, 20_000);

  it("returns a Result (not a thrown error) when abort fires before the request completes", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await adapter.synthesize("Bonjour.", controller.signal);

    expect(result.ok).toBe(false);
  }, 5_000);

  it("handles multi-sentence input without error", async () => {
    const text = "Première phrase. Deuxième phrase.";
    const result = await adapter.synthesize(text, new AbortController().signal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byteLength).toBeGreaterThan(100);
  }, 20_000);
});
