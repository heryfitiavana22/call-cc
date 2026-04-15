# Architecture — call-cc

## Overview

Web application for **voice communication with an AI agent** equipped with tools (web search, database, business APIs).

Planned future evolution: receive real phone calls via a real number (Twilio).

## Index

| File                                                  | Content                                                |
| ----------------------------------------------------- | ------------------------------------------------------ |
| [stack.md](./architecture/stack.md)                   | Tech stack, providers, tooling                         |
| [monorepo.md](./architecture/monorepo.md)             | Monorepo structure, package naming, Turborepo pipeline |
| [backend.md](./architecture/backend.md)               | Hexagonal architecture, DI container, audio flow       |
| [frontend.md](./architecture/frontend.md)             | React structure, state machine, VAD                    |
| [audio-flow.md](./architecture/audio-flow.md)         | Audio pipeline, barge-in interruptions, WS protocol    |
| [conventions.md](./architecture/conventions.md)       | Naming, SOLID, Clean Code, DRY                         |
| [error-handling.md](./architecture/error-handling.md) | Result type, error patterns per layer                  |
| [testing.md](./architecture/testing.md)               | Testing strategy per layer, coverage targets           |
