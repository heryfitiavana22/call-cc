import pino from "pino";

/**
 * Application-wide logger.
 * - Development: pretty-printed output via pino-pretty
 * - Production: structured JSON output
 */
export const logger =
  process.env["NODE_ENV"] !== "production"
    ? pino({
        level: process.env["LOG_LEVEL"] ?? "info",
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      })
    : pino({ level: process.env["LOG_LEVEL"] ?? "info" });
