# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stay up to date

- Always use current versions and practices.
- When in doubt about a version, API, or best practice, **search the web before answering or implementing**. Do not rely solely on internal knowledge that may be outdated.
- If information is uncertain, **ask rather than assume**.

## Project context

A voice AI agent monorepo. See `docs/ARCHITECTURE.md` for the architecture index and all decision files.

## General rules

- **Communication language: French** (code and comments: English)
- Do not modify the architecture without discussing it first
- Always follow hexagonal architecture (ports & adapters)
- Providers (STT, TTS, LLM) must remain swappable — never couple the domain to a provider
- All code and comments must be in **English**
- File names: **kebab-case**

## Documentation

- Always update `docs/` when architecture decisions change — in the same commit as the code change
- Do not rely only on memory — always document decisions in project files

---

## Commands

All commands run from the repo root via Turborepo (`pnpm` required).

```bash
pnpm dev          # Start all apps (frontend + backend) in watch mode
pnpm build        # Build all packages and apps
pnpm lint         # Lint all packages
pnpm typecheck    # TypeScript check all packages
pnpm test         # Run all unit tests
pnpm format       # Prettier (write)
pnpm format:check # Prettier (check only)

# api (app/api)
pnpm --filter @apps/api test:integration # vitest run on src/infrastructure/ (needs .env)
```

---
