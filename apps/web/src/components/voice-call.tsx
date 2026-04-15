import { useVoiceCall } from "@/hooks/use-voice-call";
import type { CallState } from "@call-cc/types";

const STATE_LABEL: Record<CallState, string> = {
  idle: "Idle",
  listening: "Listening...",
  processing: "Processing...",
  speaking: "Agent speaking",
};

export const VoiceCall = () => {
  const { state, transcript, error, startCall, endCall } = useVoiceCall();

  const isActive = state !== "idle";

  return (
    <div>
      <p>Status: {STATE_LABEL[state]}</p>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {transcript && <p>Transcript: {transcript}</p>}

      {!isActive ? (
        <button onClick={() => void startCall()}>Start call</button>
      ) : (
        <button onClick={endCall}>End call</button>
      )}
    </div>
  );
};
