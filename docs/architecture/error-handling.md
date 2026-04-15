# Error Handling

## Result Type — No exceptions between layers

Errors crossing layer boundaries (domain ↔ application ↔ infrastructure) use an explicit **Result type**.
Exceptions are reserved for truly unexpected errors (bugs, crashes).

Defined in `packages/types/src/result.ts`:

```ts
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E = Error>(error: E): Result<never, E> => ({ ok: false, error });
```

## Why not exceptions?

- A `throw` can silently cross multiple layers — invisible in the function signature
- The port **explicitly declares** what can fail → the contract is honest
- The use case is **forced** to handle the error — impossible to forget

## Pattern per layer

**Port (domain) — contract declares Result:**

```ts
interface ISttProvider {
  transcribe(audio: ArrayBuffer, signal: AbortSignal): Promise<Result<Transcript>>;
}
```

**Adapter (infrastructure) — wraps provider errors:**

```ts
class DeepgramSttAdapter implements ISttProvider {
  async transcribe(audio, signal): Promise<Result<Transcript>> {
    try {
      const text = await deepgram.transcribe(audio, { signal });
      return ok(new Transcript(text));
    } catch (e) {
      return err(e as Error);
    }
  }
}
```

**Use case (application) — explicitly handles:**

```ts
const result = await this.stt.transcribe(chunk, signal);
if (!result.ok) {
  return err(result.error); // propagate or handle
}
// continue with result.value
```

## When exceptions are acceptable

- Configuration errors at startup (e.g., missing API key — fail fast)
- Developer precondition violations (use `assert`)
- Fatal unrecoverable errors
