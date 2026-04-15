import type { Result } from "@call-cc/types";

export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ILlmProvider {
  chat(messages: LlmMessage[], tools: LlmTool[], signal: AbortSignal): Promise<Result<string>>;
}
