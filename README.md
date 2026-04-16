# call-cc

A real-time voice AI agent that runs in your browser. Talk to an AI assistant, get interrupted, interrupt it back — with tool use (web search, calendar, contacts) and swappable providers for STT, TTS, and LLM.

Built as a monorepo with a strict hexagonal architecture so providers stay swappable and the domain stays clean.

## Motivation

Platforms like [Vapi](https://vapi.ai), [Bland](https://bland.ai), and [Retell](https://retellai.com) make it easy to ship a voice agent fast — but you're renting their infrastructure, paying per minute, and locked into their provider choices.

**call-cc** is for when you want to own the stack:

- **Self-hosted** — runs on your own infra, no third-party data handling
- **Provider-agnostic** — swap STT, TTS, and LLM via environment variables, no vendor lock-in
- **Fully open** — read, fork, and modify every layer, from VAD to WebSocket protocol
- **Architectural reference** — hexagonal architecture applied to real-time voice AI, with documented decisions

If a managed service fits your needs, use one. This project is for teams and developers who need control, or want to understand how these systems actually work.

## What it does

- Real-time voice conversation via WebSocket streaming
- Voice Activity Detection (VAD) with barge-in support — you can interrupt the agent mid-sentence
- Sentence-level TTS streaming for low first-word latency
- Tool ecosystem: web search (Tavily), calendar, contacts
- Configurable providers — swap STT, TTS, and LLM via environment variables

## Architecture

```
Browser (React + VAD)
    ↕ WebSocket (binary audio + JSON messages)
Node.js API (Hono)
    ↕ Adapters
STT provider → LLM provider → TTS provider
```

The backend follows **hexagonal architecture** (ports & adapters). The domain defines interfaces; adapters implement them. Swapping a provider means adding a new adapter — no domain changes.

For full architecture decisions, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Monorepo structure

```
call-cc/
├── apps/
│   ├── api/          # Node.js backend (Hono + WebSocket)
│   └── web/          # React frontend (Vite + Tailwind v4)
├── packages/
│   ├── types/        # Shared types, Zod schemas, Result type
│   ├── tsconfig/     # Shared TypeScript configs
│   └── eslint-config/ # Shared ESLint 9 flat config
└── docs/             # Architecture decision records
```

## Tech stack

| Layer    | Technology                               |
| -------- | ---------------------------------------- |
| Frontend | React 19, Vite 8, Tailwind v4, Base UI   |
| Backend  | Node.js, Hono v4, Vercel AI SDK          |
| STT      | Deepgram / Groq Whisper / OpenAI Whisper |
| TTS      | OpenAI / Cartesia / ElevenLabs           |
| LLM      | OpenAI / Anthropic                       |
| VAD      | Silero VAD (`@ricky0123/vad-web`)        |
| Monorepo | Turborepo + pnpm workspaces              |

## Getting started

**Prerequisites:** Node.js 20+, pnpm 10+

```bash
# Install dependencies
pnpm install

# Copy environment files and fill in your API keys
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start everything in watch mode
pnpm dev
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:3001`.

## Configuration

### Backend (`apps/api/.env`)

| Variable         | Required | Description                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------ |
| `OPENAI_API_KEY` | Yes      | OpenAI API key (LLM + default TTS)                                             |
| `PORT`           | No       | Server port (default: `3001`)                                                  |
| `LOG_LEVEL`      | No       | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` (default: `info`) |
| `AGENT_LANGUAGE` | No       | BCP-47 code (default: `fr`). Use `"multi"` for Deepgram multilingual.          |

**STT — pick one:**

| Variable              | Provider                          |
| --------------------- | --------------------------------- |
| `DEEPGRAM_API_KEY`    | Deepgram (streaming, recommended) |
| `GROQ_API_KEY`        | Groq Whisper (fast, low cost)     |
| _(none, uses OpenAI)_ | OpenAI Whisper                    |

**TTS — set `TTS_PROVIDER` and matching keys:**

| `TTS_PROVIDER`     | Additional variables                        |
| ------------------ | ------------------------------------------- |
| `openai` (default) | _(uses `OPENAI_API_KEY`)_                   |
| `cartesia`         | `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`     |
| `elevenlabs`       | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |

**Tools (optional — enabled by presence of key):**

| Variable         | Tool enabled |
| ---------------- | ------------ |
| `TAVILY_API_KEY` | Web search   |

### Frontend (`apps/web/.env`)

| Variable          | Default                        | Description           |
| ----------------- | ------------------------------ | --------------------- |
| `VITE_API_WS_URL` | `ws://localhost:3001/voice/ws` | Backend WebSocket URL |
| `VITE_LOG_LEVEL`  | `info`                         | Browser logger level  |

## Commands

```bash
pnpm dev              # Start all apps in watch mode
pnpm build            # Build all packages and apps
pnpm lint             # ESLint all packages
pnpm typecheck        # TypeScript check all packages
pnpm test             # Run all unit tests
pnpm format           # Prettier (write)
pnpm format:check     # Prettier (check only)

# Integration tests (requires real API keys in .env)
pnpm --filter @apps/api test:integration
```

## Adding a provider

All providers are adapters that implement a port (interface) defined in the domain.

1. Create `apps/api/src/infrastructure/adapters/<provider>-<type>-adapter.ts`
2. Implement the corresponding port (`SttProviderPort`, `TtsProviderPort`, or `LlmProviderPort`)
3. Register it in `apps/api/src/container.ts`

No domain code changes required.

## Voice session flow

```
IDLE → LISTENING → PROCESSING → SPEAKING
          ↓              ↓
          └──── barge-in ┘
```

- **IDLE** — call not started
- **LISTENING** — mic active, VAD watching for speech
- **PROCESSING** — audio sent, STT + LLM running
- **SPEAKING** — TTS playing; VAD still active for barge-in

On barge-in: audio queue cleared, `{ type: 'interrupt' }` sent to server, LLM/TTS aborted via `AbortSignal`.

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss the direction.

- Code and comments: English
- File names: kebab-case
- Follow the existing hexagonal architecture — no domain coupling to providers
- Run `pnpm lint && pnpm typecheck && pnpm test` before submitting

## License

MIT
