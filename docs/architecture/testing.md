# Testing Strategy

## Rule per layer

| Layer                               | Test type       | Tools                    | Mocks                     |
| ----------------------------------- | --------------- | ------------------------ | ------------------------- |
| `domain/` (entities, value-objects) | Pure unit       | Vitest                   | None — no dependencies    |
| `application/` (use cases)          | Unit            | Vitest                   | Mocked ports (interfaces) |
| `infrastructure/` (adapters)        | Integration     | Vitest                   | Real provider (test key)  |
| `presentation/` (routes, WS)        | Integration     | Vitest                   | WebSocket test client     |
| `apps/web/` (React)                 | Component + E2E | Vitest + Testing Library | —                         |

**Single tool: Vitest** — TypeScript-native, Turborepo-compatible, fast.

## Key principle

The domain must be **100% testable without a real provider**.
Use cases receive ports (interfaces) → inject mocks in tests → no need for Deepgram or OpenAI.

```ts
// Use case test — zero real providers
it("should return error if STT fails", async () => {
  const mockStt: ISttProvider = {
    transcribe: vi.fn().mockResolvedValue({ ok: false, error: new Error("STT failed") }),
  };
  const useCase = new ProcessAudioChunk(mockStt, mockLlm, mockTts);
  const result = await useCase.execute(chunk, new AbortController().signal);
  expect(result.ok).toBe(false);
});
```

## Minimum coverage

- All `domain/` → close to 100%
- All `application/` → close to 100%
- `infrastructure/adapters/` → at least one integration test per adapter
- `presentation/` → test main WebSocket flow + interruption case
