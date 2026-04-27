export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmStreamParams {
  messages: LlmMessage[];
  tools: LlmTool[];
  signal: AbortSignal;
  system?: string;
}

export interface LlmProviderPort {
  /**
   * Streams the LLM response token by token.
   * The consumer is responsible for assembling the full text if needed.
   * Throws on error — callers should wrap with try/catch.
   */
  stream(params: LlmStreamParams): AsyncGenerator<string, void>;
}
