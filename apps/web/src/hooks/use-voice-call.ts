import { useCallback, useEffect, useRef, useState } from "react";
import type { CallState, ClientMessage, ServerMessage } from "@call-cc/types";
import { serverMessageSchema } from "@call-cc/types";
import { env } from "@/config/env";
import { logger } from "@/shared/logger";

// How long to wait after the last audio chunk before signalling speech end.
// Will be replaced by VAD (Silero via @ricky0123/vad-web) in the next step.
const SILENCE_TIMEOUT_MS = 1500;

export interface UseVoiceCallReturn {
  state: CallState;
  transcript: string;
  error: string | null;
  startCall: () => Promise<void>;
  endCall: () => void;
}

export const useVoiceCall = (): UseVoiceCallReturn => {
  const [state, setState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isAgentSpeakingRef = useRef(false);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    logger.debug("Server message received", { type: message.type });

    if (message.type === "ready") {
      isAgentSpeakingRef.current = false;
      setState("listening");
      return;
    }

    if (message.type === "transcript") {
      logger.info("Transcript received", { text: message.text });
      setTranscript(message.text);
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
  }, []);

  const playAudioChunk = useCallback(async (buffer: ArrayBuffer) => {
    if (!audioContextRef.current) return;
    const audioBuffer = await audioContextRef.current.decodeAudioData(buffer.slice(0));
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.start();
  }, []);

  const interrupt = useCallback(() => {
    logger.info("Barge-in: interrupting agent");
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    audioQueueRef.current = [];
    isAgentSpeakingRef.current = false;
    send({ type: "interrupt" });
    setState("listening");
  }, [send]);

  /**
   * Resets the silence timer.
   * When the timer fires, it signals the backend that speech has ended.
   * This is a fallback until VAD (@ricky0123/vad-web) is integrated.
   */
  const resetSilenceTimer = useCallback((ws: WebSocket) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        logger.info("Silence detected — sending speech.end");
        setState("processing");
        ws.send(JSON.stringify({ type: "speech.end" } satisfies ClientMessage));
      }
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const startCall = useCallback(async () => {
    setError(null);
    setTranscript("");

    audioContextRef.current = new AudioContext();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const ws = new WebSocket(env.VITE_API_WS_URL);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        logger.debug("Audio chunk received from agent", { bytes: event.data.byteLength });
        isAgentSpeakingRef.current = true;
        setState("speaking");
        audioQueueRef.current.push(event.data);
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
      setState("idle");
      stream.getTracks().forEach((t) => t.stop());
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    ws.onopen = () => {
      logger.info("WebSocket connected", { url: env.VITE_API_WS_URL });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size === 0) return;
        if (ws.readyState !== WebSocket.OPEN) return;

        // Only send audio when the user is speaking (not when agent is speaking)
        if (isAgentSpeakingRef.current) {
          // Barge-in: user speaks while agent is speaking → interrupt
          interrupt();
          return;
        }

        e.data
          .arrayBuffer()
          .then((buf) => {
            ws.send(buf);
            // Reset silence timer on every audio chunk
            resetSilenceTimer(ws);
          })
          .catch(() => null);
      };

      recorder.start(100); // chunk every 100ms

      // VAD integration point: @ricky0123/vad-web (Silero VAD)
      // Replace resetSilenceTimer with VAD speech-end events for accurate detection
      // TODO: integrate VAD in next step
    };

    ws.onerror = () => {
      logger.error("WebSocket connection failed");
      setError("WebSocket connection failed");
      setState("idle");
    };
  }, [handleServerMessage, interrupt, playAudioChunk, resetSilenceTimer]);

  const endCall = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    send({ type: "session.end" });
    wsRef.current?.close();
    audioContextRef.current?.close().catch(() => null);
  }, [send]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      wsRef.current?.close();
      audioContextRef.current?.close().catch(() => null);
    };
  }, []);

  return { state, transcript, error, startCall, endCall };
};
