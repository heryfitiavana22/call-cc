# Claude Instructions — apps/web

See root `CLAUDE.md` and `docs/ARCHITECTURE.md` for project-wide rules.

## Package specifics

- Framework: **React 19 + Vite**
- All environment variables must be validated via Zod in `src/config/env.ts`
- Env vars must be prefixed with `VITE_` to be exposed to the browser
- Logger: lightweight console wrapper at `src/shared/logger.ts` — always use this, never `console.log` directly
- Log in hooks only (not components). Log level controlled by `VITE_LOG_LEVEL` env var

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

## Styling

- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no `tailwind.config.js`)
- **shadcn/ui** components in `src/components/ui/`
- Use only shadcn CSS variable `apps/web/src/index.css`
- Do not add custom CSS variables outside of `index.css` shadcn theme block

## shadcn component usage

shadcn components use CVA (class-variance-authority) for variants.

```tsx
// ❌ avoid — overriding what CVA already handles
<Button variant="outline" className="text-destructive hover:text-destructive" />

// ✅ use the existing variant
<Button variant="destructive" />
```
