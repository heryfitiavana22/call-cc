# Claude Instructions — apps/web

See root `CLAUDE.md` and `docs/ARCHITECTURE.md` for project-wide rules.

## Package specifics

- Framework: **React 19 + Vite**
- All environment variables must be validated via Zod in `src/config/env.ts`
- Env vars must be prefixed with `VITE_` to be exposed to the browser

## Voice call rules

- Voice session state is managed by the `useVoiceCall` hook — single source of truth
- State machine transitions: `idle → listening → processing → speaking`
- VAD (`@ricky0123/vad-web`) must always be active, including during `speaking` state
- On barge-in: clear audio queue, send `{ type: 'interrupt' }`, transition to `listening`
- Never send audio chunks when state is not `listening`

## Component rules

- Hooks in `src/hooks/`, components in `src/components/`
- No business logic in components — use hooks
- WebSocket connection lives in `useVoiceCall`, not in components
