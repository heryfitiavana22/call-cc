import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // LLM
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

  // STT
  DEEPGRAM_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  // BCP-47 language code for transcription (e.g. "fr", "en", "es").
  // Set to "multi" to use nova-3's multilingual mode.
  DEEPGRAM_LANGUAGE: z.string().default("fr"),

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
