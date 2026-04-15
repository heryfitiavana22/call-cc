# Claude Instructions — apps/api

See root `CLAUDE.md` and `docs/ARCHITECTURE.md` for project-wide rules.

## Package specifics

- Runtime: **Node.js** with Hono v4+
- WebSocket: `@hono/node-ws` via `createNodeWebSocket`
- All environment variables must be validated via Zod in `src/config/env.ts` — fail fast at startup
- Logger: `pino` via `src/shared/logger.ts` — always use this, never `console.log`
- Log in: `presentation/` (WS lifecycle), `application/` (use case steps + timing). Never in `domain/`

## Hexagonal architecture rules

- `domain/` has **zero** imports from `infrastructure/` or `presentation/`
- `application/` imports only from `domain/`
- `infrastructure/` imports from `domain/` only (implements ports)
- `presentation/` imports from `application/` and `domain/`
- New providers: add an adapter in `infrastructure/adapters/`, never touch domain or use cases

## Port naming convention

- Port files: `{concern}-port.ts` (e.g., `stt-provider-port.ts`, `calendar-port.ts`)
- Port interfaces: `{Concern}Port` suffix (e.g., `SttProviderPort`, `CalendarPort`)
- No `I` prefix on interfaces — use the `Port` suffix for ports, plain `PascalCase` for others

## Adapter convention

- Name: `{Provider}{Port}Adapter` (e.g., `DeepgramSttAdapter`)
- File: `kebab-case` (e.g., `deepgram-stt-adapter.ts`)
- Must implement the corresponding port interface
- Errors must be caught and returned as `Result` — no throws crossing layer boundaries

## Use case convention

- One use case = one public `execute()` method
- Always accepts `AbortSignal` as last parameter (for barge-in cancellation)
- Returns `Result<T>`

## Function / constructor parameters

When a function or constructor has 3+ parameters, or any optional parameter, use an options object:

```ts
// ✅
new ProcessVoiceTurn({ stt, llm, tts, systemPrompt });
buildSystemPrompt({ language, tools });
```

## LLM tools

- Tool names are constants in `src/config/tool-keys.ts` (`TOOL_KEYS`) — never hardcode tool name strings
- Tool adapters live in `infrastructure/adapters/tools/`
- `agent-tools.ts` is the only file that imports both domain ports and AI SDK types
- Tools are enabled dynamically: tool present in `ToolAdapters` → included in ToolSet and system prompt
- `AGENT_LANGUAGE` (env var) controls the language in the system prompt (BCP-47, default `fr`)
- `TAVILY_API_KEY` absent → web search tool completely omitted
