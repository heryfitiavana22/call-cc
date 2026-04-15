# Code Conventions

## File Naming — kebab-case

All files without exception:

```
voice-session.ts
deepgram-stt-adapter.ts
process-audio-chunk.ts
audio-stream-handler.ts
i-stt-provider.ts
use-voice-call.ts
```

## TypeScript Naming

| Element             | Convention                | Example              |
| ------------------- | ------------------------- | -------------------- |
| Files               | `kebab-case`              | `voice-session.ts`   |
| Classes             | `PascalCase`              | `VoiceSession`       |
| Interfaces          | `PascalCase` + `I` prefix | `ISttProvider`       |
| Types               | `PascalCase`              | `AudioChunk`         |
| Functions / methods | `camelCase`               | `transcribeAudio()`  |
| Variables           | `camelCase`               | `audioChunk`         |
| Constants           | `UPPER_SNAKE_CASE`        | `MAX_CHUNK_SIZE`     |
| Folders             | `kebab-case`              | `use-cases/`, `stt/` |

## Adapter Naming

`{Provider}{Port}Adapter`:

- `DeepgramSttAdapter`
- `OpenAITtsAdapter`
- `AnthropicLlmAdapter`

## SOLID

| Principle                     | Concrete application                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| **S** — Single Responsibility | One use case = one action. One adapter = one provider.                                |
| **O** — Open/Closed           | Adding a provider = new adapter, no modification of existing code                     |
| **L** — Liskov Substitution   | All STT adapters are interchangeable via `ISttProvider`                               |
| **I** — Interface Segregation | `ISttProvider`, `ITtsProvider`, `ILlmProvider` are separate — no single fat interface |
| **D** — Dependency Inversion  | Use cases depend on ports (interfaces), never on adapters directly                    |

## Clean Code

- **Short functions** — one function does one thing. If it does more, split it.
- **Explicit names** — no `data`, `tmp`, `res`, `obj`. The name tells you what it is.
- **No magic numbers/strings** — always a named constant.
- **No useless comments** — code reads itself. A comment explains the _why_, never the _what_.
- **No dead code** — delete it, never comment it out.
- **Max nesting depth** — avoid more than 2–3 levels. Prefer early return over nested `if/else`.

```ts
// ❌ avoid
async function process(d: any) {
  if (d) {
    if (d.audio) {
      // ...
    }
  }
}

// ✅ prefer
async function processAudioChunk(chunk: AudioChunk): Promise<Result<Transcript>> {
  if (!chunk.isValid()) return err(new Error("Invalid audio chunk"));
  // ...
}
```

## DRY (Don't Repeat Yourself)

Do not duplicate code that can be shared. Extract shared logic into a function, hook, or utility.
Exception: duplication is acceptable when the abstraction would be more complex than the repetition itself,
or when the two pieces of code are similar by coincidence but serve different purposes.
