# Testing Strategy

## Rule per layer

| Layer                               | Test type   | Tools  | Mocks                                     |
| ----------------------------------- | ----------- | ------ | ----------------------------------------- |
| `domain/` (entities, value-objects) | Pure unit   | Vitest | None — no dependencies                    |
| `application/` (use cases)          | Unit        | Vitest | Mocked ports (vi.fn() on interfaces)      |
| `infrastructure/` (adapters)        | Integration | Vitest | None — real provider, real API keys       |
| `presentation/` (routes, WS)        | Unit        | Vitest | Fake WSContext (vi.fn()) — no HTTP server |

**Single tool: Vitest** — TypeScript-native, Turborepo-compatible, fast.

## Running tests

```bash
# Unit tests only (integration skipped automatically when no real keys are set)
pnpm test

# Integration tests — requires a real .env with OPENAI_API_KEY and DEEPGRAM_API_KEY
pnpm test:integration
```

Integration tests use `describe.skipIf` to detect whether real keys are present.
They are skipped in CI or whenever only stub keys are configured.

## File location convention

Tests are **co-located** with the code they test, inside a `__tests__/` subfolder:

```
src/
  domain/
    value-objects/
      transcript.ts
      __tests__/
        transcript.test.ts
    entities/
      voice-session.ts
      __tests__/
        voice-session.test.ts
  application/
    use-cases/
      process-audio-chunk.ts
      __tests__/
        process-audio-chunk.test.ts
  infrastructure/
    adapters/
      stt/
        deepgram-stt-adapter.ts
        __tests__/
          deepgram-stt-adapter.test.ts
  presentation/
    websocket/
      audio-stream-handler.ts
      __tests__/
        audio-stream-handler.test.ts
```

Rationale: deleting a module takes its tests with it; no separate tree to keep in sync.

## Key principle

The domain must be **100% testable without a real provider**.
Use cases receive ports (interfaces) → inject mocks in tests → no need for Deepgram or OpenAI.

```ts
// Use case test — zero real providers
it("returns err when STT fails", async () => {
  const mockStt: ISttProvider = {
    transcribe: vi.fn().mockResolvedValue(err(new Error("STT failed"))),
  };
  const mockLlm: ILlmProvider = { stream: vi.fn() };
  const mockTts: ITtsProvider = { synthesize: vi.fn() };

  const useCase = new ProcessAudioChunk(mockStt, mockLlm, mockTts);
  const result = await useCase.execute(session, audioBuffer, [], new AbortController().signal, {
    onTranscript: vi.fn(),
    onAudioChunk: vi.fn(),
  });

  expect(result.ok).toBe(false);
});
```

## Minimum coverage

- All `domain/` → close to 100%
- All `application/` → close to 100%
- `infrastructure/adapters/` → at least one integration test per adapter
- `presentation/` → test main WebSocket flow + interruption case
