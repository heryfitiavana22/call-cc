/**
 * Result type — represents the success or failure of an operation.
 * Used instead of exceptions for expected errors that cross layer boundaries.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <E = Error>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;

export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } => !result.ok;
