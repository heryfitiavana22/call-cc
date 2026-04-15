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
- **shadcn/ui** components in `src/components/ui/` — add with `pnpm dlx shadcn@latest add <name>`
- Use only shadcn CSS variables (`--background`, `--foreground`, `--primary`, `--muted`, etc.)
- Do not add custom CSS variables outside of `index.css` shadcn theme block
- `index.css` contains only: Tailwind imports + shadcn theme variables + `@layer base` reset

## shadcn component usage

shadcn components use CVA (class-variance-authority) for variants. Rules:

- Always use the existing variant prop for intent — never override CVA styles via `className`
- `className` on a shadcn component is for layout only (`w-full`, `mt-2`, `mx-auto`, etc.)
- Check the component file in `src/components/ui/` before adding className overrides

```tsx
// ❌ avoid — overriding what CVA already handles
<Button variant="outline" className="text-destructive hover:text-destructive" />

// ✅ use the existing variant
<Button variant="destructive" />
```

## Conversation history

- `useVoiceCall` exposes `messages: Message[]` — array of `{ id, role, text }` objects
- User messages are added when `{ type: "transcript", final: true }` is received
- Agent messages are added when `{ type: "agent.reply" }` is received
- Messages reset on each new call (`startCall()`)
