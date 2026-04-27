import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3001),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    // LLM — required
    OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

    // Language — BCP-47 code used in STT, LLM system prompt, and TTS (default: fr)
    // Set to "multi" for Deepgram multilingual mode (STT only)
    AGENT_LANGUAGE: z.string().default("fr"),

    // Tools — each key enables the corresponding tool at runtime
    TAVILY_API_KEY: z.string().optional(),

    // ── STT ──────────────────────────────────────────────────────────────────
    STT_PROVIDER: z.enum(["groq", "deepgram", "openai"]).default("groq"),
    GROQ_API_KEY: z.string().optional(),
    DEEPGRAM_API_KEY: z.string().optional(),

    // ── TTS ──────────────────────────────────────────────────────────────────
    TTS_PROVIDER: z.enum(["openai", "cartesia", "elevenlabs"]).default("openai"),
    // openai — reuses OPENAI_API_KEY, no extra key needed
    CARTESIA_API_KEY: z.string().optional(),
    CARTESIA_VOICE_ID: z.string().optional(),
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // STT key validation
    if (data.STT_PROVIDER === "groq" && !data.GROQ_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GROQ_API_KEY"],
        message: "GROQ_API_KEY is required when STT_PROVIDER=groq",
      });
    }

    if (data.STT_PROVIDER === "deepgram" && !data.DEEPGRAM_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["DEEPGRAM_API_KEY"],
        message: "DEEPGRAM_API_KEY is required when STT_PROVIDER=deepgram",
      });
    }

    // TTS key validation
    if (data.TTS_PROVIDER === "cartesia") {
      if (!data.CARTESIA_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["CARTESIA_API_KEY"],
          message: "CARTESIA_API_KEY is required when TTS_PROVIDER=cartesia",
        });
      }
      if (!data.CARTESIA_VOICE_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["CARTESIA_VOICE_ID"],
          message: "CARTESIA_VOICE_ID is required when TTS_PROVIDER=cartesia",
        });
      }
    }

    if (data.TTS_PROVIDER === "elevenlabs") {
      if (!data.ELEVENLABS_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["ELEVENLABS_API_KEY"],
          message: "ELEVENLABS_API_KEY is required when TTS_PROVIDER=elevenlabs",
        });
      }
      if (!data.ELEVENLABS_VOICE_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["ELEVENLABS_VOICE_ID"],
          message: "ELEVENLABS_VOICE_ID is required when TTS_PROVIDER=elevenlabs",
        });
      }
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment variables:");
  console.error(JSON.stringify(result.error.issues, null, 2));
  process.exit(1);
}

export const env = result.data;
