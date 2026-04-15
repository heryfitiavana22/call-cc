import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ILlmProvider, LlmMessage, LlmTool } from "@/domain/ports/i-llm-provider";
import type { ToolSet } from "ai";

const DEFAULT_MODEL = "gpt-4o";

export class OpenAILlmAdapter implements ILlmProvider {
  constructor(private readonly agentTools: ToolSet = {}) {}

  async *stream(
    messages: LlmMessage[],
    _tools: LlmTool[],
    signal: AbortSignal,
  ): AsyncGenerator<string, void> {
    const hasTools = Object.keys(this.agentTools).length > 0;

    const result = streamText({
      model: openai(DEFAULT_MODEL),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(hasTools && {
        tools: this.agentTools,
        stopWhen: stepCountIs(5),
      }),
      abortSignal: signal,
    });

    yield* result.textStream;
  }
}
