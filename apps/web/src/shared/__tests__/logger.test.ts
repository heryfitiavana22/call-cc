import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// We import the logger AFTER patching import.meta.env so the module picks up
// the desired log level.  Each describe block re-imports with a fresh level.
// ---------------------------------------------------------------------------

const makeLogger = async (level: "error" | "warn" | "info" | "debug") => {
  vi.stubEnv("VITE_LOG_LEVEL", level);
  vi.stubEnv("VITE_API_WS_URL", "ws://localhost:3001/voice/ws");
  // Force a fresh module evaluation for every level under test
  const { logger } = await import("@/shared/logger?level=" + level);
  return logger;
};

describe("logger", () => {
  const consoleMocks = {
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
  };

  beforeEach(() => {
    Object.values(consoleMocks).forEach((spy) => spy.mockClear());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("log level filtering", () => {
    it("level error — only error is printed", async () => {
      const logger = await makeLogger("error");
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");

      expect(consoleMocks.error).toHaveBeenCalledOnce();
      expect(consoleMocks.warn).not.toHaveBeenCalled();
      expect(consoleMocks.info).not.toHaveBeenCalled();
      expect(consoleMocks.debug).not.toHaveBeenCalled();
    });

    it("level warn — error and warn are printed", async () => {
      const logger = await makeLogger("warn");
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");

      expect(consoleMocks.error).toHaveBeenCalledOnce();
      expect(consoleMocks.warn).toHaveBeenCalledOnce();
      expect(consoleMocks.info).not.toHaveBeenCalled();
      expect(consoleMocks.debug).not.toHaveBeenCalled();
    });

    it("level info — error, warn, info are printed", async () => {
      const logger = await makeLogger("info");
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");

      expect(consoleMocks.error).toHaveBeenCalledOnce();
      expect(consoleMocks.warn).toHaveBeenCalledOnce();
      expect(consoleMocks.info).toHaveBeenCalledOnce();
      expect(consoleMocks.debug).not.toHaveBeenCalled();
    });

    it("level debug — all methods print", async () => {
      const logger = await makeLogger("debug");
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");

      expect(consoleMocks.error).toHaveBeenCalledOnce();
      expect(consoleMocks.warn).toHaveBeenCalledOnce();
      expect(consoleMocks.info).toHaveBeenCalledOnce();
      expect(consoleMocks.debug).toHaveBeenCalledOnce();
    });
  });

  describe("message formatting", () => {
    it("includes the message in the output", async () => {
      const logger = await makeLogger("debug");
      logger.info("hello world");
      expect(consoleMocks.info).toHaveBeenCalledWith(expect.stringContaining("hello world"));
    });

    it("includes context as serialised JSON when provided", async () => {
      const logger = await makeLogger("debug");
      logger.info("msg", { key: "value" });
      expect(consoleMocks.info).toHaveBeenCalledWith(expect.stringContaining('"key":"value"'));
    });

    it("does not include JSON when no context provided", async () => {
      const logger = await makeLogger("debug");
      logger.warn("no ctx");
      const call = consoleMocks.warn.mock.calls[0]?.[0] as string;
      expect(call).not.toContain("{");
    });

    it("prefixes with the uppercased level name", async () => {
      const logger = await makeLogger("debug");
      logger.debug("test");
      expect(consoleMocks.debug).toHaveBeenCalledWith(expect.stringContaining("[DEBUG]"));
    });
  });
});
