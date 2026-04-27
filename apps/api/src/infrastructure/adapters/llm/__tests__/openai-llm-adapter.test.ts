import { describe, it, expect } from "vitest";
import { OpenAILlmAdapter } from "@/infrastructure/adapters/llm/openai-llm-adapter";
import type { LlmMessage } from "@/domain/ports/llm-provider-port";
import { env } from "@/config/env";

const hasRealKey = env.OPENAI_API_KEY !== "test-key";

describe.skipIf(!hasRealKey)("OpenAILlmAdapter (integration)", () => {
  const adapter = new OpenAILlmAdapter();

  const messages: LlmMessage[] = [{ role: "user", content: "Réponds uniquement par le mot 'OK'." }];

  it("yields at least one token", async () => {
    const tokens: string[] = [];
    for await (const token of adapter.stream({
      messages,
      tools: [],
      signal: new AbortController().signal,
    })) {
      tokens.push(token);
    }
    expect(tokens.length).toBeGreaterThan(0);
  }, 30_000);

  it("assembled response is a non-empty string", async () => {
    let reply = "";
    for await (const token of adapter.stream({
      messages,
      tools: [],
      signal: new AbortController().signal,
    })) {
      reply += token;
    }
    expect(reply.trim().length).toBeGreaterThan(0);
  }, 30_000);

  it("stops early when abort fires mid-stream without throwing unhandled error", async () => {
    const controller = new AbortController();
    const longMessages: LlmMessage[] = [
      { role: "user", content: "Écris un essai de 500 mots sur la nature." },
    ];

    let tokenCount = 0;
    let caughtError: unknown = null;

    try {
      for await (const _token of adapter.stream({
        messages: longMessages,
        tools: [],
        signal: controller.signal,
      })) {
        tokenCount++;
        if (tokenCount >= 3) controller.abort();
      }
    } catch (e) {
      caughtError = e;
    }

    // Either the loop exited cleanly or an AbortError was thrown — both are acceptable.
    // What must NOT happen: an unrelated error or a hanging promise.
    if (caughtError !== null) {
      expect((caughtError as Error).name).toMatch(/AbortError|APIUserAbortError/);
    }
    expect(tokenCount).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("respects conversation history — passes previous messages to the model", async () => {
    const history: LlmMessage[] = [
      { role: "user", content: "Mon prénom est Marcel." },
      { role: "assistant", content: "Bonjour Marcel !" },
      { role: "user", content: "Quel est mon prénom ? Réponds en un mot." },
    ];

    let reply = "";
    for await (const token of adapter.stream({
      messages: history,
      tools: [],
      signal: new AbortController().signal,
    })) {
      reply += token;
    }

    expect(reply.toLowerCase()).toContain("marcel");
  }, 30_000);
});
