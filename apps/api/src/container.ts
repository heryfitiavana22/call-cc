import { DeepgramSttAdapter } from "./infrastructure/adapters/stt/deepgram-stt-adapter.js";
import { OpenAITtsAdapter } from "./infrastructure/adapters/tts/openai-tts-adapter.js";
import { OpenAILlmAdapter } from "./infrastructure/adapters/llm/openai-llm-adapter.js";
import { StartVoiceSession } from "./application/use-cases/start-voice-session.js";
import { ProcessAudioChunk } from "./application/use-cases/process-audio-chunk.js";
import { EndVoiceSession } from "./application/use-cases/end-voice-session.js";

/**
 * Dependency container — instantiates and injects adapters into use cases.
 * To swap a provider: replace the adapter here only, nothing else changes.
 */
const buildContainer = () => {
  // Providers — swap here to change implementation
  const stt = new DeepgramSttAdapter();
  const tts = new OpenAITtsAdapter();
  const llm = new OpenAILlmAdapter();

  // Use cases
  const startVoiceSession = new StartVoiceSession();
  const processAudioChunk = new ProcessAudioChunk(stt, llm, tts);
  const endVoiceSession = new EndVoiceSession();

  return {
    startVoiceSession,
    processAudioChunk,
    endVoiceSession,
  };
};

export type AppContainer = ReturnType<typeof buildContainer>;

export const container = buildContainer();
