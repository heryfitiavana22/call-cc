import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Result } from "@call-cc/types";
import { ok, err } from "@call-cc/types";
import type { ILlmProvider, LlmMessage, LlmTool } from "@/domain/ports/i-llm-provider";

const DEFAULT_MODEL = "gpt-4o";

export class OpenAILlmAdapter implements ILlmProvider {
  async chat(
    messages: LlmMessage[],
    _tools: LlmTool[],
    signal: AbortSignal,
  ): Promise<Result<string>> {
    try {
      const { text } = await generateText({
        model: openai(DEFAULT_MODEL),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        abortSignal: signal,
      });
      return ok(text);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
