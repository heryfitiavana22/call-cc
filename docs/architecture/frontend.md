# Frontend Architecture

## Structure

```
apps/web/src/
├── components/
│   └── voice-call.tsx          # Main voice call UI
├── hooks/
│   └── use-voice-call.ts       # Core hook: state machine + WebSocket + VAD
└── config/
    └── env.ts                  # Zod-validated env vars
```

## Voice Session State Machine

```
         ┌─────────────────────────────────────┐
         │                                     ▼
IDLE → LISTENING → PROCESSING → SPEAKING
                      ▲               │
                      │   interrupt   │
                      └───────────────┘
```

| State        | Description                                   |
| ------------ | --------------------------------------------- |
| `idle`       | Call not started                              |
| `listening`  | Mic active, VAD watching for speech           |
| `processing` | Audio sent to backend — STT → LLM in progress |
| `speaking`   | TTS playing on frontend, VAD still active     |

## VAD — Voice Activity Detection

Library: `@ricky0123/vad-web` (Silero VAD)

- Runs in a WebWorker — does not block the main thread
- Lightweight ML model, accurate at distinguishing human voice from silence/noise
- Always active, even during `speaking` state (enables barge-in)

Echo cancellation handled natively by the browser:

```ts
navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
});
```

## Barge-in (Interruptions)

See [audio-flow.md](./audio-flow.md) for the full interruption sequence.

## WebSocket Protocol

See [audio-flow.md](./audio-flow.md) for the full message protocol.

## Environment Variables

Validated at startup via Zod in `src/config/env.ts`:

| Variable          | Default                        | Description           |
| ----------------- | ------------------------------ | --------------------- |
| `VITE_API_WS_URL` | `ws://localhost:3001/voice/ws` | Backend WebSocket URL |
