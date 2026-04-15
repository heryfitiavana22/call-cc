import { env } from "@/config/env";

type LogLevel = "error" | "warn" | "info" | "debug";

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LEVELS[env.VITE_LOG_LEVEL];

const shouldLog = (level: LogLevel) => LEVELS[level] <= currentLevel;

const format = (level: LogLevel, msg: string, ctx?: Record<string, unknown>) =>
  ctx
    ? `[${level.toUpperCase()}] ${msg} ${JSON.stringify(ctx)}`
    : `[${level.toUpperCase()}] ${msg}`;

/**
 * Lightweight browser logger controlled by VITE_LOG_LEVEL env var.
 * Levels: error < warn < info < debug (default: info)
 */
export const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => {
    if (shouldLog("error")) console.error(format("error", msg, ctx));
  },
  warn: (msg: string, ctx?: Record<string, unknown>) => {
    if (shouldLog("warn")) console.warn(format("warn", msg, ctx));
  },
  info: (msg: string, ctx?: Record<string, unknown>) => {
    if (shouldLog("info")) console.info(format("info", msg, ctx));
  },
  debug: (msg: string, ctx?: Record<string, unknown>) => {
    if (shouldLog("debug")) console.debug(format("debug", msg, ctx));
  },
};
