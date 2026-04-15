import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  // LLM
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

  // STT
  DEEPGRAM_API_KEY: z.string().min(1, "DEEPGRAM_API_KEY is required"),

  // TTS (optional — falls back to OpenAI TTS)
  ELEVENLABS_API_KEY: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment variables:");
  console.error(JSON.stringify(result.error.issues, null, 2));
  process.exit(1);
}

export const env = result.data;
