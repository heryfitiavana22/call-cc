# Monorepo Structure

```
call-cc/
├── apps/
│   ├── web/                    # React + Vite frontend
│   └── api/                    # Hono backend (Node.js)
├── packages/
│   ├── eslint-config/          # Shared ESLint 9 flat config
│   ├── tsconfig/               # Shared TypeScript configs
│   └── types/                  # Shared types (Result, WS messages, Zod schemas)
├── docs/
│   ├── ARCHITECTURE.md         # Index → links to sub-files
│   └── architecture/           # Detailed decision files
├── turbo.json
├── pnpm-workspace.yaml
├── CLAUDE.md                   # Root Claude instructions
├── .husky/
├── .prettierrc
└── package.json                # Root: husky, lint-staged, commitlint
```

## Package naming

All internal packages use the `@call-cc/` scope:

- `@call-cc/types`
- `@call-cc/tsconfig`
- `@call-cc/eslint-config`
- `@call-cc/api`
- `@call-cc/web`

## Turborepo task pipeline

| Task        | Depends on                    | Cache           |
| ----------- | ----------------------------- | --------------- |
| `build`     | `^build` (dependencies first) | `dist/**`       |
| `dev`       | —                             | No (persistent) |
| `lint`      | `^build`                      | Yes             |
| `typecheck` | `^build`                      | Yes             |
| `test`      | `^build`                      | `coverage/**`   |
