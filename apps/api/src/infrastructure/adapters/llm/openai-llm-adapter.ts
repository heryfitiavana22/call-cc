import type { Result } from "@call-cc/types";
import { err } from "@call-cc/types";
import type { ILlmProvider, LlmMessage, LlmTool } from "../../../domain/ports/i-llm-provider.js";

export class OpenAILlmAdapter implements ILlmProvider {
  async chat(
    messages: LlmMessage[],
    tools: LlmTool[],
    signal: AbortSignal,
  ): Promise<Result<string>> {
    // TODO: implement OpenAI chat via Vercel AI SDK v6
    void messages;
    void tools;
    void signal;
    return err(new Error("OpenAILlmAdapter not yet implemented"));
  }
}
