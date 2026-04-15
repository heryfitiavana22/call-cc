# Backend Architecture

## Hexagonal Architecture (Ports & Adapters)

The domain never knows about providers. Swapping a provider = changing the adapter in `container.ts` only.

```
apps/api/src/
├── domain/
│   ├── entities/
│   │   └── voice-session.ts
│   ├── ports/                         # Interfaces (the "contracts")
│   │   ├── i-stt-provider.ts          # Speech-to-Text
│   │   ├── i-tts-provider.ts          # Text-to-Speech
│   │   └── i-llm-provider.ts          # LLM Agent
│   └── value-objects/
│       └── transcript.ts
│
├── application/
│   └── use-cases/
│       ├── start-voice-session.ts
│       ├── process-audio-chunk.ts
│       └── end-voice-session.ts
│
├── infrastructure/
│   └── adapters/
│       ├── stt/
│       │   ├── deepgram-stt-adapter.ts       # implements ISttProvider
│       │   └── openai-whisper-stt-adapter.ts # implements ISttProvider
│       ├── tts/
│       │   ├── openai-tts-adapter.ts         # implements ITtsProvider
│       │   └── elevenlabs-tts-adapter.ts     # implements ITtsProvider
│       └── llm/
│           ├── openai-llm-adapter.ts         # implements ILlmProvider
│           └── anthropic-llm-adapter.ts      # implements ILlmProvider
│
├── presentation/
│   ├── routes/
│   │   └── voice-route.ts
│   └── websocket/
│       └── audio-stream-handler.ts
│
└── container.ts                        # DI — no tsyringe/inversify
```

## Dependency Injection

Homemade container in `container.ts` — no external DI library (tsyringe, inversify).
Those libs add decorators and `reflect-metadata` for no real benefit at this scale.

```ts
// To swap STT provider: change one line here
const stt = new DeepgramSttAdapter(); // ← swap to OpenAIWhisperSttAdapter
const tts = new OpenAITtsAdapter();
const llm = new OpenAILlmAdapter();
```

## Audio Flow

```
Browser mic
  │  WebSocket (audio chunks)
  ▼
Backend (Hono + @hono/node-ws)
  │
  ├── ISttProvider.transcribe(chunk, signal) → Transcript
  │
  ├── ILlmProvider.chat(messages, tools, signal) → string
  │
  └── ITtsProvider.synthesize(text, signal) → ArrayBuffer
          │
          │  WebSocket (audio chunks)
          ▼
      Browser plays audio
```

## Configuration

All environment variables are validated at startup via Zod in `src/config/env.ts`.
The app fails fast with a clear error if a required variable is missing.
