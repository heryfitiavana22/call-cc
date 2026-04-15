import { DeepgramSttAdapter } from "@/infrastructure/adapters/stt/deepgram-stt-adapter";
import { OpenAITtsAdapter } from "@/infrastructure/adapters/tts/openai-tts-adapter";
import { OpenAILlmAdapter } from "@/infrastructure/adapters/llm/openai-llm-adapter";
import { StartVoiceSession } from "@/application/use-cases/start-voice-session";
import { ProcessAudioChunk } from "@/application/use-cases/process-audio-chunk";
import { EndVoiceSession } from "@/application/use-cases/end-voice-session";

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
