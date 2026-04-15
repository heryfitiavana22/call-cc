import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // Provide stub values so env.ts validation passes in tests.
    // Real providers are never called in unit tests — all ports are mocked.
    env: {
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-key",
      DEEPGRAM_API_KEY: "test-key",
      DEEPGRAM_LANGUAGE: "fr",
      LOG_LEVEL: "error",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
