# Claude Instructions — call-cc

## Stay up to date

- We are in **2026**. Always use current versions and practices.
- When in doubt about a version, API, or best practice, **search the web before answering or implementing**. Do not rely solely on internal knowledge that may be outdated.
- If information is uncertain, **ask rather than assume**.

## Project context

See `docs/ARCHITECTURE.md` for the architecture index and all decision files.

## General rules

- **Communication language: French** (code and comments: English)
- Do not modify the architecture without discussing it first
- Always follow hexagonal architecture (ports & adapters)
- Providers (STT, TTS, LLM) must remain swappable — never couple the domain to a provider
- All code and comments must be in **English**
- File names: **kebab-case**

## Documentation

- Always update `docs/` when architecture decisions change
- Do not rely only on memory — always document decisions in project files (they follow the repo across machines)
