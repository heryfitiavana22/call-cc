import type { LlmProviderPort, LlmStreamParams } from "@/domain/ports/llm-provider-port";

export class AnthropicLlmAdapter implements LlmProviderPort {
  async *stream(_params: LlmStreamParams): AsyncGenerator<string, void> {
    // TODO: implement Anthropic Claude streaming via Vercel AI SDK v6
    yield* [];
    throw new Error("AnthropicLlmAdapter not yet implemented");
  }
}
