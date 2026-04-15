# Claude Instructions — packages/types

See root `CLAUDE.md` for project-wide rules.

## Package specifics

This package contains **only shared types and Zod schemas** used by both `apps/api` and `apps/web`.

## Rules

- No runtime logic here — only types, interfaces, Zod schemas, and small pure helpers (e.g., `ok()`, `err()`)
- Zod schemas must export both the schema and the inferred TypeScript type
- WebSocket message types must stay in sync with `src/ws-messages.ts`
- The `Result<T>` type is the single source of truth for error handling across the monorepo — do not redefine it elsewhere
