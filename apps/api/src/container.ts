import { OpenAITtsAdapter } from "@/infrastructure/adapters/tts/openai-tts-adapter";
import { OpenAILlmAdapter } from "@/infrastructure/adapters/llm/openai-llm-adapter";
import { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import { ProcessVoiceTurn } from "@/application/use-cases/process-voice-turn";
import { EndVoiceSession } from "@/application/use-cases/end-voice-session";
import { GroqSttAdapter } from "./infrastructure/adapters/stt/groq-stt-adapter";
// import { DeepgramSttAdapter } from "./infrastructure/adapters/stt/deepgram-stt-adapter";
import { buildSystemPrompt } from "./config/agent-prompt";
import { buildAgentTools, type ToolAdapters } from "./infrastructure/adapters/llm/agent-tools";
import { TavilyWebSearchAdapter } from "./infrastructure/adapters/tools/tavily-web-search-adapter";
import { FakeCalendarAdapter } from "./infrastructure/adapters/tools/fake-calendar-adapter";
import { FakeContactsAdapter } from "./infrastructure/adapters/tools/fake-contacts-adapter";
import { env } from "./config/env";

/**
 * Dependency container — instantiates and injects adapters into use cases.
 * To swap a provider: replace the adapter here only, nothing else changes.
 *
 * Tool adapters are only instantiated when their env key is present.
 * The system prompt and ToolSet are built accordingly — no key = no tool.
 */
const buildContainer = () => {
  // STT — swap here to change implementation
  const stt = new GroqSttAdapter();
  // const stt = new DeepgramSttAdapter();
  const tts = new OpenAITtsAdapter();

  // Tool adapters — conditionally enabled by env vars
  const toolAdapters: ToolAdapters = {
    ...(env.TAVILY_API_KEY && { webSearch: new TavilyWebSearchAdapter(env.TAVILY_API_KEY) }),
    calendar: new FakeCalendarAdapter(),
    contacts: new FakeContactsAdapter(),
  };

  const enabledTools = {
    webSearch: !!toolAdapters.webSearch,
    calendar: true,
    contacts: true,
  };

  const systemPrompt = buildSystemPrompt({ language: env.AGENT_LANGUAGE, tools: enabledTools });
  const agentTools = buildAgentTools(toolAdapters);
  const llm = new OpenAILlmAdapter(agentTools);

  // Stateless use cases — shared across connections
  const startVoiceSession = new StartVoiceSession();
  const endVoiceSession = new EndVoiceSession();

  // Factory — creates a fresh ProcessVoiceTurn per WebSocket connection
  const createProcessVoiceTurn = () => new ProcessVoiceTurn({ stt, llm, tts, systemPrompt });

  return {
    startVoiceSession,
    createProcessVoiceTurn,
    endVoiceSession,
  };
};

export type AppContainer = ReturnType<typeof buildContainer>;

export const container = buildContainer();
