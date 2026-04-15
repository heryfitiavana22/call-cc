import { useCallback, useEffect, useRef, useState } from "react";
import type { CallState, ClientMessage, ServerMessage } from "@call-cc/types";

const WS_URL = import.meta.env["VITE_API_WS_URL"] ?? "ws://localhost:3001/voice/ws";

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

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        if (isAgentSpeakingRef.current) {
          audioQueueRef.current.push(event.data);
          isAgentSpeakingRef.current = true;
          setState("speaking");
          void playAudioChunk(event.data);
        }
        return;
      }

      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        handleServerMessage(message);
      } catch {
        // message non-JSON ignoré
      }
    };

    ws.onclose = () => {
      setState("idle");
      stream.getTracks().forEach((t) => t.stop());
    };

    ws.onopen = () => {
      // Le backend envoie session.started + ready automatiquement à l'ouverture
      // Ici on configure l'envoi des chunks audio via MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size === 0) return;
        if (state === "listening") {
          e.data
            .arrayBuffer()
            .then((buf) => ws.send(buf))
            .catch(() => null);
        }
      };

      recorder.start(100); // chunk toutes les 100ms

      // VAD — à intégrer avec @ricky0123/vad-web (lazy import pour éviter le chargement WASM au démarrage)
      // Lorsque le VAD détecte de la voix pendant que l'agent parle → interrupt()
      // TODO: intégrer VAD ici dans la prochaine étape
      void interrupt; // référence pour éviter l'avertissement lint
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
      setState("idle");
    };
  }, [handleServerMessage, interrupt, playAudioChunk, state]);

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
