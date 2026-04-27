import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3001),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    // LLM
    OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

    // BCP-47 language code for the whole app (STT, LLM system prompt, etc.).
    // Set to "multi" to use Deepgram's multilingual mode (STT only).
    AGENT_LANGUAGE: z.string().default("fr"),

    // STT — which provider to use (default: groq)
    // Switching provider: set STT_PROVIDER and the matching API key.
    STT_PROVIDER: z.enum(["groq", "deepgram", "openai"]).default("groq"),
    DEEPGRAM_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),

    // Tools (each key enables the corresponding tool at runtime)
    TAVILY_API_KEY: z.string().optional(),

    // TTS — which provider to use (default: openai)
    // Switching provider: set TTS_PROVIDER and the matching API key + voice ID.
    TTS_PROVIDER: z.enum(["openai", "cartesia", "elevenlabs"]).default("openai"),

    // OpenAI TTS — reuses OPENAI_API_KEY (always required for the LLM anyway)

    // Cartesia TTS — https://cartesia.ai
    // Voice IDs: https://play.cartesia.ai/voices
    CARTESIA_API_KEY: z.string().optional(),
    CARTESIA_VOICE_ID: z.string().optional(),

    // ElevenLabs TTS — https://elevenlabs.io
    // Voice IDs: https://elevenlabs.io/voice-library
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional(),
  })
  .superRefine((data, ctx) => {
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
