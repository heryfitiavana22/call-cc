import { useCallback, useEffect, useRef, useState } from "react";
import type { CallState, ClientMessage, ServerMessage } from "@call-cc/types";
import { serverMessageSchema } from "@call-cc/types";
import { env } from "../config/env.js";

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

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    if (message.type === "ready") {
      isAgentSpeakingRef.current = false;
      setState("listening");
      return;
    }

    if (message.type === "transcript") {
      setTranscript(message.text);
      return;
    }

    if (message.type === "session.started") {
      setState("listening");
      return;
    }

    if (message.type === "session.ended") {
      setState("idle");
      return;
    }

    if (message.type === "error") {
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
    audioQueueRef.current = [];
    isAgentSpeakingRef.current = false;
    send({ type: "interrupt" });
    setState("listening");
  }, [send]);

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
        isAgentSpeakingRef.current = true;
        setState("speaking");
        audioQueueRef.current.push(event.data);
        void playAudioChunk(event.data);
        return;
      }

      const parsed = serverMessageSchema.safeParse(JSON.parse(event.data as string));
      if (parsed.success) handleServerMessage(parsed.data);
    };

    ws.onclose = () => {
      setState("idle");
      stream.getTracks().forEach((t) => t.stop());
    };

    ws.onopen = () => {
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size === 0) return;
        if (ws.readyState === WebSocket.OPEN) {
          e.data
            .arrayBuffer()
            .then((buf) => ws.send(buf))
            .catch(() => null);
        }
      };

      recorder.start(100); // chunk every 100ms

      // VAD integration point: @ricky0123/vad-web (Silero VAD)
      // When VAD detects speech while isAgentSpeakingRef.current is true → call interrupt()
      // Loaded lazily to avoid blocking WASM initialization at startup
      // TODO: integrate VAD in next step
      void interrupt;
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
      setState("idle");
    };
  }, [handleServerMessage, interrupt, playAudioChunk]);

  const endCall = useCallback(() => {
    send({ type: "session.end" });
    wsRef.current?.close();
    audioContextRef.current?.close().catch(() => null);
  }, [send]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      audioContextRef.current?.close().catch(() => null);
    };
  }, []);

  return { state, transcript, error, startCall, endCall };
};
