import { DeepgramSttAdapter } from "./infrastructure/adapters/stt/deepgram-stt-adapter.js";
import { OpenAITtsAdapter } from "./infrastructure/adapters/tts/openai-tts-adapter.js";
import { OpenAILlmAdapter } from "./infrastructure/adapters/llm/openai-llm-adapter.js";
import { StartVoiceSession } from "./application/use-cases/start-voice-session.js";
import { ProcessAudioChunk } from "./application/use-cases/process-audio-chunk.js";
import { EndVoiceSession } from "./application/use-cases/end-voice-session.js";

/**
 * Container de dépendances — instancie et injecte les adapters dans les use cases.
 * Pour changer de provider : remplacer l'adapter ici uniquement.
 */
const buildContainer = () => {
  // Providers — swap ici pour changer d'implémentation
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
