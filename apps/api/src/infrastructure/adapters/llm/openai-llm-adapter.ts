import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ILlmProvider, LlmMessage, LlmTool } from "@/domain/ports/i-llm-provider";

const DEFAULT_MODEL = "gpt-4o";

export class OpenAILlmAdapter implements ILlmProvider {
  async *stream(
    messages: LlmMessage[],
    _tools: LlmTool[],
    signal: AbortSignal,
  ): AsyncGenerator<string, void> {
    const result = streamText({
      model: openai(DEFAULT_MODEL),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      abortSignal: signal,
    });

    yield* result.textStream;
  }
}
