import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import type { LlmProviderPort, LlmStreamParams } from "@/domain/ports/llm-provider-port";
import type { ToolSet } from "ai";

const DEFAULT_MODEL = "gpt-5-mini";

export class OpenAILlmAdapter implements LlmProviderPort {
  constructor(private readonly agentTools: ToolSet = {}) {}

  async *stream({ messages, signal, system }: LlmStreamParams): AsyncGenerator<string, void> {
    const hasTools = Object.keys(this.agentTools).length > 0;

    const result = streamText({
      model: openai(DEFAULT_MODEL),
      ...(system && { system }),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(hasTools && {
        tools: this.agentTools,
        stopWhen: stepCountIs(5),
      }),
      abortSignal: signal,
      providerOptions: { openai: { reasoningEffort: "minimal" } },
    });

    yield* result.textStream;
  }
}
