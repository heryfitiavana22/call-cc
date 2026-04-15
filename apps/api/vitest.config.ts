import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // Pass real keys through when available (integration tests loaded via --env-file).
    // Fall back to stubs so env.ts validation passes in unit test runs.
    env: {
      NODE_ENV: "test",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "test-key",
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ?? "test-key",
      DEEPGRAM_LANGUAGE: process.env.DEEPGRAM_LANGUAGE ?? "fr",
      LOG_LEVEL: "fatal",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
