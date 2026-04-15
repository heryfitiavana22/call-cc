# Backend Architecture

## Hexagonal Architecture (Ports & Adapters)

The domain never knows about providers. Swapping a provider = changing the adapter in `container.ts` only.

```
apps/api/src/
├── config/
│   ├── env.ts                         # Zod-validated env vars (fail-fast)
│   ├── agent-prompt.ts                # buildSystemPrompt({ language, tools })
│   └── tool-keys.ts                   # TOOL_KEYS constants (shared by tools + prompt)
│
├── domain/
│   ├── entities/
│   │   └── voice-session.ts
│   ├── ports/                         # Port interfaces (the "contracts")
│   │   ├── stt-provider-port.ts       # SttProviderPort, SttStreamPort
│   │   ├── tts-provider-port.ts       # TtsProviderPort
│   │   ├── llm-provider-port.ts       # LlmProviderPort, LlmMessage, LlmTool
│   │   ├── web-search-port.ts         # WebSearchPort, WebSearchResult
│   │   ├── calendar-port.ts           # CalendarPort, CalendarEvent
│   │   └── contacts-port.ts           # ContactsPort, Contact
│   └── value-objects/
│       └── transcript.ts
│
├── application/
│   └── use-cases/
│       ├── start-voice-session.ts
│       ├── process-voice-turn.ts      # ProcessVoiceTurn({ stt, llm, tts, systemPrompt })
│       └── end-voice-session.ts
│
├── infrastructure/
│   └── adapters/
│       ├── stt/
│       │   ├── groq-stt-adapter.ts           # implements SttProviderPort (default)
│       │   ├── deepgram-stt-adapter.ts       # implements SttProviderPort (alternative)
│       │   └── openai-whisper-stt-adapter.ts # implements SttProviderPort (alternative)
│       ├── tts/
│       │   ├── openai-tts-adapter.ts         # implements TtsProviderPort (default)
│       │   └── elevenlabs-tts-adapter.ts     # implements TtsProviderPort (alternative)
│       ├── llm/
│       │   ├── openai-llm-adapter.ts         # implements LlmProviderPort (default)
│       │   ├── anthropic-llm-adapter.ts      # implements LlmProviderPort (alternative)
│       │   └── agent-tools.ts                # buildAgentTools(adapters) → AI SDK ToolSet
│       └── tools/
│           ├── tavily-web-search-adapter.ts  # implements WebSearchPort (real, requires TAVILY_API_KEY)
│           ├── fake-calendar-adapter.ts      # implements CalendarPort (fake, French random data)
│           └── fake-contacts-adapter.ts      # implements ContactsPort (fake, French random data)
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
const stt = new GroqSttAdapter(); // ← swap to DeepgramSttAdapter or OpenAIWhisperSttAdapter
const tts = new OpenAITtsAdapter();
// Tool adapters enabled conditionally by env vars
const toolAdapters: ToolAdapters = {
  ...(env.TAVILY_API_KEY && { webSearch: new TavilyWebSearchAdapter(env.TAVILY_API_KEY) }),
  calendar: new FakeCalendarAdapter(),
  contacts: new FakeContactsAdapter(),
};
const systemPrompt = buildSystemPrompt({ language: env.AGENT_LANGUAGE, tools: enabledTools });
const llm = new OpenAILlmAdapter(buildAgentTools(toolAdapters));
```

## Audio Flow

```
Browser mic (VAD)
  │  WebSocket (WAV binary + { type: 'speech.end' })
  ▼
Backend (Hono + @hono/node-ws)
  │
  ├── SttProviderPort.createStream() → SttStreamPort
  │     write(chunk) per audio frame, finalize() → Transcript
  │
  ├── LlmProviderPort.stream(messages, tools, signal) → AsyncGenerator<string>
  │     tokens buffered until sentence boundary (.!?)
  │     tool calls executed mid-stream if AI SDK invokes them
  │
  └── TtsProviderPort.synthesize(sentence, signal) → ArrayBuffer
          │  (one call per sentence — streaming TTS)
          │  WebSocket (ArrayBuffer = mp3, one per sentence)
          ▼
      Browser plays audio chunks as they arrive
```

See `docs/architecture/audio-flow.md` for full protocol details, barge-in handling, and sentence-level TTS streaming rationale.

## Configuration

All environment variables are validated at startup via Zod in `src/config/env.ts`.
The app fails fast with a clear error if a required variable is missing.

Key variables:

- `AGENT_LANGUAGE` — BCP-47 code used in the system prompt (e.g. `fr`, `en`). Defaults to `fr`.
- `TAVILY_API_KEY` — enables the web search tool. If absent, the tool is omitted from both the ToolSet and the system prompt.
- `DEEPGRAM_LANGUAGE` — language hint passed to Deepgram STT only (overrides `AGENT_LANGUAGE` for STT).

## LLM Tools

Tool adapters live in `infrastructure/adapters/tools/`. Each adapter implements a domain port.
`agent-tools.ts` wires adapters to AI SDK `tool()` definitions and is the **only** file allowed to import both domain ports and AI SDK types.

Tools are enabled dynamically: a tool is included only if its adapter is present in `ToolAdapters`.
The system prompt is built with the same set of enabled tools — no key = no mention of the tool.

Tool names are defined as constants in `config/tool-keys.ts` (`TOOL_KEYS`), shared between `agent-tools.ts` and `agent-prompt.ts` to keep names in sync.
