import pino from "pino";
import { env } from "@/config/env";

/**
 * Application-wide logger.
 * - Development: pretty-printed output via pino-pretty
 * - Production: structured JSON output
 * Log level is controlled by LOG_LEVEL env var (default: "info").
 */
export const logger =
  env.NODE_ENV !== "production"
    ? pino({
        level: env.LOG_LEVEL,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      })
    : pino({ level: env.LOG_LEVEL });
