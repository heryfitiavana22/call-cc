import type { ILlmProvider, LlmMessage, LlmTool } from "@/domain/ports/i-llm-provider";

export class AnthropicLlmAdapter implements ILlmProvider {
  // eslint-disable-next-line @typescript-eslint/require-await
  async *stream(
    _messages: LlmMessage[],
    _tools: LlmTool[],
    _signal: AbortSignal,
  ): AsyncGenerator<string, void> {
    // TODO: implement Anthropic Claude streaming via Vercel AI SDK v6
    throw new Error("AnthropicLlmAdapter not yet implemented");
  }
}
