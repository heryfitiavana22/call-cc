import { OpenAITtsAdapter } from "@/infrastructure/adapters/tts/openai-tts-adapter";
import { CartesiaTtsAdapter } from "@/infrastructure/adapters/tts/cartesia-tts-adapter";
import { ElevenLabsTtsAdapter } from "@/infrastructure/adapters/tts/elevenlabs-tts-adapter";
import { OpenAILlmAdapter } from "@/infrastructure/adapters/llm/openai-llm-adapter";
import { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import { ProcessVoiceTurn } from "@/application/use-cases/process-voice-turn";
import { EndVoiceSession } from "@/application/use-cases/end-voice-session";
// import { GroqSttAdapter } from "./infrastructure/adapters/stt/groq-stt-adapter";
// import { DeepgramSttAdapter } from "./infrastructure/adapters/stt/deepgram-stt-adapter";
import { buildSystemPrompt, AGENT_TTS_INSTRUCTIONS, type ProsodyMode } from "./config/agent-prompt";
import { buildAgentTools, type ToolAdapters } from "./infrastructure/adapters/llm/agent-tools";
import { TavilyWebSearchAdapter } from "./infrastructure/adapters/tools/tavily-web-search-adapter";
import { FakeCalendarAdapter } from "./infrastructure/adapters/tools/fake-calendar-adapter";
import { FakeContactsAdapter } from "./infrastructure/adapters/tools/fake-contacts-adapter";
import type { TtsProviderPort } from "./domain/ports/tts-provider-port";
import { env } from "./config/env";
import { GroqSttAdapter } from "./infrastructure/adapters/stt/groq-stt-adapter";

/**
 * Builds the TTS adapter based on the TTS_PROVIDER env var.
 * env.ts superRefine already guarantees the matching API key + voice ID are set.
 */
const buildTts = (): TtsProviderPort => {
  switch (env.TTS_PROVIDER) {
    case "cartesia":
      return new CartesiaTtsAdapter(env.CARTESIA_API_KEY as string, {
        voiceId: env.CARTESIA_VOICE_ID as string,
        language: env.AGENT_LANGUAGE,
      });
    case "elevenlabs":
      return new ElevenLabsTtsAdapter(env.ELEVENLABS_API_KEY as string, {
        voiceId: env.ELEVENLABS_VOICE_ID as string,
      });
    case "openai":
    default:
      return new OpenAITtsAdapter({ instructions: AGENT_TTS_INSTRUCTIONS });
  }
};

/**
 * Dependency container — instantiates and injects adapters into use cases.
 * To swap a provider: set TTS_PROVIDER (and matching keys) in .env, nothing else changes.
 *
 * Tool adapters are only instantiated when their env key is present.
 * The system prompt and ToolSet are built accordingly — no key = no tool.
 */
const buildContainer = () => {
  // STT — swap here to change implementation (uncomment GroqSttAdapter to revert to batch)
  const stt = new GroqSttAdapter();
  // const stt = new DeepgramSttAdapter();
  const tts = buildTts();

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

  const prosodyMode: ProsodyMode =
    env.TTS_PROVIDER === "elevenlabs"
      ? "inline-tags"
      : env.TTS_PROVIDER === "cartesia"
        ? "ssml-tags"
        : "none";

  const systemPrompt = buildSystemPrompt({
    language: env.AGENT_LANGUAGE,
    tools: enabledTools,
    prosodyMode,
  });

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
