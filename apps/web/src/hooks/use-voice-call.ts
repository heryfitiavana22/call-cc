import { useCallback, useEffect, useRef, useState } from "react";
import type { CallState, ClientMessage, ServerMessage } from "@call-cc/types";
import { serverMessageSchema } from "@call-cc/types";
import { env } from "@/config/env";
import { logger } from "@/shared/logger";

// RMS amplitude threshold (0–128 scale) above which we consider the user is speaking.
// Tune this down if speech is not detected, up if background noise triggers it.
const SPEECH_RMS_THRESHOLD = 8;

// How long the RMS must stay below threshold before signalling speech end.
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isAgentSpeakingRef = useRef(false);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const stopSpeechCheck = useCallback(() => {
    if (speechCheckIntervalRef.current) {
      clearInterval(speechCheckIntervalRef.current);
      speechCheckIntervalRef.current = null;
    }
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
      stopSpeechCheck();
      setState("idle");
      stream.getTracks().forEach((t) => t.stop());
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      recorderRef.current = null;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    ws.onopen = () => {
      logger.info("WebSocket connected", { url: env.VITE_API_WS_URL });

      // Pick the best supported mimeType — audio/webm is not supported on Safari
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      logger.debug("MediaRecorder mimeType selected", { mimeType: mimeType ?? "browser default" });

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;

      recorder.onerror = (e) => {
        logger.error("MediaRecorder error", { error: String(e) });
      };

      // Send audio chunks to the backend for accumulation.
      // Barge-in check: if the agent is speaking, interrupt it.
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size === 0) return;
        if (ws.readyState !== WebSocket.OPEN) return;

        if (isAgentSpeakingRef.current) {
          interrupt();
          return;
        }

        e.data
          .arrayBuffer()
          .then((buf) => {
            logger.debug("Audio chunk sent", { bytes: buf.byteLength });
            ws.send(buf);
          })
          .catch(() => null);
      };

      recorder.start(100);
      logger.info("MediaRecorder started", { mimeType: recorder.mimeType, state: recorder.state });

      // Speech detection via AnalyserNode RMS energy.
      // The silence timer only resets when the user's voice is above the threshold.
      // This replaces the naive "reset on every chunk" approach which never detected silence.
      // TODO: replace with VAD (@ricky0123/vad-web) in next step.
      const analyser = audioContextRef.current!.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContextRef.current!.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      speechCheckIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN || isAgentSpeakingRef.current) return;

        analyser.getByteTimeDomainData(dataArray);
        // RMS on a 0–128 centered scale (128 = silence in Web Audio API)
        const rms = Math.sqrt(
          dataArray.reduce((sum, v) => sum + (v - 128) ** 2, 0) / dataArray.length,
        );
        logger.debug("Audio RMS", { rms: Math.round(rms) });

        if (rms > SPEECH_RMS_THRESHOLD) {
          // User is speaking — reset the silence countdown
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              logger.info("Silence detected — sending speech.end");
              setState("processing");
              ws.send(JSON.stringify({ type: "speech.end" } satisfies ClientMessage));
            }
          }, SILENCE_TIMEOUT_MS);
        }
      }, 100);
    };

    ws.onerror = () => {
      logger.error("WebSocket connection failed");
      setError("WebSocket connection failed");
      setState("idle");
    };
  }, [handleServerMessage, interrupt, playAudioChunk, stopSpeechCheck]);

  const endCall = useCallback(() => {
    stopSpeechCheck();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    send({ type: "session.end" });
    wsRef.current?.close();
    audioContextRef.current?.close().catch(() => null);
  }, [send, stopSpeechCheck]);

  useEffect(() => {
    return () => {
      stopSpeechCheck();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      wsRef.current?.close();
      audioContextRef.current?.close().catch(() => null);
    };
  }, [stopSpeechCheck]);

  return { state, transcript, error, startCall, endCall };
};
