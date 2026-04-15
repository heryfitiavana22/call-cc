import { describe, it, expect } from "vitest";
import { Transcript } from "./transcript";

describe("Transcript", () => {
  describe("constructor", () => {
    it("stores trimmed text", () => {
      const t = new Transcript("  hello world  ");
      expect(t.text).toBe("hello world");
    });

    it("accepts non-empty text without throwing", () => {
      expect(() => new Transcript("bonjour")).not.toThrow();
    });

    it("accepts empty text without throwing", () => {
      expect(() => new Transcript("")).not.toThrow();
    });

    it("accepts whitespace-only text without throwing", () => {
      expect(() => new Transcript("   ")).not.toThrow();
    });

    it("defaults isFinal to true", () => {
      const t = new Transcript("hello");
      expect(t.isFinal).toBe(true);
    });

    it("stores isFinal when explicitly set to false", () => {
      const t = new Transcript("hello", false);
      expect(t.isFinal).toBe(false);
    });
  });

  describe("isEmpty", () => {
    it("returns true for empty string", () => {
      expect(new Transcript("").isEmpty).toBe(true);
    });

    it("returns true for whitespace-only string (trimmed to empty)", () => {
      expect(new Transcript("   ").isEmpty).toBe(true);
    });

    it("returns false for non-empty text", () => {
      expect(new Transcript("bonjour").isEmpty).toBe(false);
    });

    it("returns false for text with surrounding whitespace", () => {
      expect(new Transcript("  hi  ").isEmpty).toBe(false);
    });
  });
});
