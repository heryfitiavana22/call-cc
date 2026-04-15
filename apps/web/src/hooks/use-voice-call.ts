import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import type { CallState, ClientMessage, ServerMessage } from "@call-cc/types";
import { serverMessageSchema } from "@call-cc/types";
import { env } from "@/config/env";
import { logger } from "@/shared/logger";

export interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

export interface UseVoiceCallReturn {
  state: CallState;
  messages: Message[];
  error: string | null;
  startCall: () => Promise<void>;
  endCall: () => void;
}

/**
 * Encodes a Float32Array (VAD output, 16kHz mono) into a WAV ArrayBuffer.
 * WAV is self-describing — no need to pass encoding/sample_rate params to Deepgram.
 */
const float32ToWav = (float32: Float32Array, sampleRate = 16000): ArrayBuffer => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = float32.length * 2; // Int16 = 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < float32.length; i++) {
    const sample = float32[i] ?? 0;
    view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample * 32768))), true);
    offset += 2;
  }

  return buffer;
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const useVoiceCall = (): UseVoiceCallReturn => {
  const [state, setState] = useState<CallState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addMessage = useCallback((role: Message["role"], text: string) => {
    setMessages((prev) => [...prev, { id: makeId(), role, text }]);
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isAgentSpeakingRef = useRef(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  // Set to true when 'ready' arrives while audio is still playing — transition deferred until queue empties
  const pendingReadyRef = useRef(false);
  // Incremented on stopAllAudio — invalidates in-flight decodeAudioData promises
  const audioGenerationRef = useRef(0);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      logger.debug("Server message received", { type: message.type });

      if (message.type === "ready") {
        if (isPlayingRef.current) {
          pendingReadyRef.current = true;
        } else {
          isAgentSpeakingRef.current = false;
          setState("listening");
        }
        return;
      }

      if (message.type === "transcript") {
        logger.info("Transcript received", { text: message.text });
        if (message.final) addMessage("user", message.text);
        return;
      }

      if (message.type === "agent.reply") {
        logger.info("Agent reply received", { text: message.text });
        addMessage("agent", message.text);
        return;
      }

      if (message.type === "session.started") {
        logger.info("Session started");
        setState("listening");
        return;
      }

      if (message.type === "session.ended") {
        logger.info("Session ended");
        setState("idle");
        return;
      }

      if (message.type === "error") {
        logger.error("Server error", { message: message.message });
        setError(message.message);
      }
    },
    [addMessage],
  );

  const stopAllAudio = useCallback(() => {
    audioGenerationRef.current++;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    pendingReadyRef.current = false;
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    });
    activeSourcesRef.current = [];
  }, []);

  const playNextInQueue = useCallback(() => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      isAgentSpeakingRef.current = false;
      // Backend already sent 'ready' while we were playing — now we can transition
      if (pendingReadyRef.current) {
        pendingReadyRef.current = false;
        setState("listening");
      }
      return;
    }

    const audioBuffer = audioQueueRef.current.shift()!;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      playNextInQueue();
    };
    isPlayingRef.current = true;
    source.start();
  }, []);

  const playAudioChunk = useCallback(
    async (buffer: ArrayBuffer) => {
      if (!audioContextRef.current) return;
      // Capture the generation before the async decode — if stopAllAudio fires while we
      // are awaiting, the generation will have changed and we discard the decoded chunk.
      const gen = audioGenerationRef.current;
      const audioBuffer = await audioContextRef.current.decodeAudioData(buffer.slice(0));
      if (gen !== audioGenerationRef.current) return;
      audioQueueRef.current.push(audioBuffer);
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    },
    [playNextInQueue],
  );

  const startCall = useCallback(async () => {
    setError(null);
    setMessages([]);

    audioContextRef.current = new AudioContext();

    const ws = new WebSocket(env.VITE_API_WS_URL);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        logger.debug("Audio chunk received from agent", { bytes: event.data.byteLength });
        isAgentSpeakingRef.current = true;
        setState("speaking");
        void playAudioChunk(event.data);
        return;
      }

      const parsed = serverMessageSchema.safeParse(JSON.parse(event.data as string));
      if (parsed.success) {
        handleServerMessage(parsed.data);
      } else {
        logger.warn("Unknown message from server", { raw: event.data as string });
      }
    };

    ws.onclose = () => {
      logger.info("WebSocket closed");
      vadRef.current?.pause();
      setState("idle");
    };

    ws.onerror = () => {
      logger.error("WebSocket connection failed");
      setError("WebSocket connection failed");
      setState("idle");
    };

    ws.onopen = async () => {
      logger.info("WebSocket connected", { url: env.VITE_API_WS_URL });

      try {
        const vad = await MicVAD.new({
          onSpeechStart: () => {
            logger.info("VAD: speech start detected");
            // Barge-in: user speaks while agent is speaking
            if (isAgentSpeakingRef.current) {
              logger.info("Barge-in: interrupting agent");
              stopAllAudio();
              isAgentSpeakingRef.current = false;
              send({ type: "interrupt" });
              setState("listening");
            }
          },
          onSpeechEnd: (audio: Float32Array) => {
            logger.info("VAD: speech end detected", { samples: audio.length });

            if (ws.readyState !== WebSocket.OPEN) return;

            // Convert Float32 PCM (VAD output, 16kHz) → WAV (self-describing, Deepgram reads the header)
            const wavBuffer = float32ToWav(audio);
            ws.send(wavBuffer);
            logger.debug("Audio sent as WAV", { bytes: wavBuffer.byteLength });

            setState("processing");
            ws.send(JSON.stringify({ type: "speech.end" } satisfies ClientMessage));
          },
          onVADMisfire: () => {
            logger.debug("VAD: misfire (speech too short, ignored)");
          },
        });

        vadRef.current = vad;
        vad.start();
        logger.info("VAD started");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error("VAD initialization failed", { error: msg });
        setError(`VAD initialization failed: ${msg}`);
        ws.close();
      }
    };
  }, [handleServerMessage, playAudioChunk, send]);

  const endCall = useCallback(() => {
    vadRef.current?.pause();
    send({ type: "session.end" });
    wsRef.current?.close();
    audioContextRef.current?.close().catch(() => null);
  }, [send]);

  useEffect(() => {
    return () => {
      vadRef.current?.pause();
      wsRef.current?.close();
      audioContextRef.current?.close().catch(() => null);
    };
  }, []);

  return { state, messages, error, startCall, endCall };
};
