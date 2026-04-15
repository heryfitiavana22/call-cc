# Frontend Architecture

## Stack

- **React 19** + Vite
- **Tailwind CSS v4** — configured via `@tailwindcss/vite` plugin, no config file
- **shadcn/ui** — components in `src/components/ui/`, uses shadcn CSS variables only
  - Use variant props for intent, `className` for layout only — never override CVA via className

## Structure

```
apps/web/src/
├── components/
│   ├── voice-call.tsx          # Main voice call UI (header, messages, controls)
│   └── ui/                     # shadcn components (button, scroll-area, …)
├── hooks/
│   └── use-voice-call.ts       # Core hook: state machine + WebSocket + VAD + messages
├── lib/
│   └── utils.ts                # shadcn cn() utility
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

## Conversation history

`useVoiceCall` tracks a `messages: Message[]` array — one entry per turn:

| Field  | Type                | Description                        |
| ------ | ------------------- | ---------------------------------- |
| `id`   | `string`            | Unique identifier                  |
| `role` | `"user" \| "agent"` | Who sent the message               |
| `text` | `string`            | Transcript (user) or reply (agent) |

User messages come from `{ type: "transcript", final: true }` WS messages.
Agent messages come from `{ type: "agent.reply" }` WS messages (sent by backend after TTS).

## Environment Variables

Validated at startup via Zod in `src/config/env.ts`:

| Variable          | Default                        | Description                          |
| ----------------- | ------------------------------ | ------------------------------------ |
| `VITE_API_WS_URL` | `ws://localhost:3001/voice/ws` | Backend WebSocket URL                |
| `VITE_LOG_LEVEL`  | `info`                         | Logger level (error/warn/info/debug) |

## VAD Setup (Vite)

`@ricky0123/vad-web` requires WASM and ONNX model files to be served at the root URL.
Handled by `vite-plugin-static-copy` in `vite.config.ts` — no manual configuration needed.

The dev server also needs COOP/COEP headers for `SharedArrayBuffer` (used by onnxruntime-web):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are set automatically in `vite.config.ts`.
