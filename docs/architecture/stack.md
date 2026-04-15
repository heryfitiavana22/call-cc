# Tech Stack

## Choices

| Layer           | Choice                    | Reason                                        |
| --------------- | ------------------------- | --------------------------------------------- |
| Monorepo        | pnpm + Turborepo v2       | Standard 2026                                 |
| Frontend        | React + Vite + TypeScript | Lightweight, fast                             |
| Backend         | Hono v4+ + Node.js        | TypeScript-first, WebSocket via @hono/node-ws |
| LLM             | Vercel AI SDK v6          | 25+ providers, switch in 2 lines              |
| STT             | Deepgram (swappable)      | Best real-time streaming                      |
| TTS             | OpenAI TTS (swappable)    | Simple to start                               |
| Audio transport | WebSocket                 | Compatible with future Twilio                 |

**Starting providers**: OpenAI (LLM + TTS) + Deepgram (STT)

## Tooling

| Tool        | Role                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| Husky v9    | Git hooks                                                              |
| lint-staged | Prettier on staged files only                                          |
| Commitlint  | Commit convention (`feat:`, `fix:`, `chore:`…)                         |
| Prettier    | Unified formatting                                                     |
| ESLint 9    | Flat config (`eslint.config.js`), shared from `packages/eslint-config` |
| Vitest      | Testing — TypeScript-native, Turborepo-compatible                      |
| Zod         | Runtime validation — env vars, WebSocket messages                      |
| pino        | Structured logging (JSON in prod, pretty-print in dev via pino-pretty) |
