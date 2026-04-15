import { z } from "zod";

const envSchema = z.object({
  VITE_API_WS_URL: z.string().default("ws://localhost:3001/voice/ws"),
  VITE_LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

const result = envSchema.safeParse(import.meta.env);

if (!result.success) {
  throw new Error(`Invalid environment variables: ${JSON.stringify(result.error.issues)}`);
}

export const env = result.data;
console.log("env", env);
