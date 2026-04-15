import { OpenAITtsAdapter } from "@/infrastructure/adapters/tts/openai-tts-adapter";
import { OpenAILlmAdapter } from "@/infrastructure/adapters/llm/openai-llm-adapter";
import { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import { ProcessVoiceTurn } from "@/application/use-cases/process-voice-turn";
import { EndVoiceSession } from "@/application/use-cases/end-voice-session";
// import { GroqSttAdapter } from "./infrastructure/adapters/stt/groq-stt-adapter";
import { DeepgramSttAdapter } from "./infrastructure/adapters/stt/deepgram-stt-adapter";
import { buildSystemPrompt } from "./config/agent-prompt";
import { env } from "./config/env";

/**
 * Dependency container — instantiates and injects adapters into use cases.
 * To swap a provider: replace the adapter here only, nothing else changes.
 *
 * ProcessVoiceTurn is stateful (holds an STT stream per utterance), so it must
 * be instantiated per WebSocket connection via createProcessVoiceTurn().
 */
const buildContainer = () => {
  // Providers — swap here to change implementation
  // const stt = new GroqSttAdapter();
  const stt = new DeepgramSttAdapter();
  const tts = new OpenAITtsAdapter();
  const llm = new OpenAILlmAdapter();

  // Stateless use cases — shared across connections
  const startVoiceSession = new StartVoiceSession();
  const endVoiceSession = new EndVoiceSession();

  const systemPrompt = buildSystemPrompt(env.AGENT_LANGUAGE);

  // Factory — creates a fresh ProcessVoiceTurn per WebSocket connection
  const createProcessVoiceTurn = () => new ProcessVoiceTurn(stt, llm, tts, systemPrompt);

  return {
    startVoiceSession,
    createProcessVoiceTurn,
    endVoiceSession,
  };
};

export type AppContainer = ReturnType<typeof buildContainer>;

export const container = buildContainer();
