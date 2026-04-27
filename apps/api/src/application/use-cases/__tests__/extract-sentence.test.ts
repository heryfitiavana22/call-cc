import { describe, it, expect } from "vitest";
import { extractSentence } from "@/application/use-cases/extract-sentence";

describe("extractSentence", () => {
  // --- basic extraction ---

  it("extracts a sentence ending with '.'", () => {
    expect(extractSentence("Hello world. More text")).toEqual(["Hello world.", "More text"]);
  });

  it("extracts a sentence ending with '!'", () => {
    expect(extractSentence("Stop! Now")).toEqual(["Stop!", "Now"]);
  });

  it("extracts a sentence ending with '?'", () => {
    expect(extractSentence("Are you there? Yes")).toEqual(["Are you there?", "Yes"]);
  });

  it("extracts when punctuation is at end of buffer", () => {
    expect(extractSentence("Done.")).toEqual(["Done.", ""]);
  });

  it("trims leading whitespace from remainder", () => {
    const result = extractSentence("First.   Second");
    expect(result).toEqual(["First.", "Second"]);
  });

  // --- no sentence yet ---

  it("returns null when no terminator found", () => {
    expect(extractSentence("Hello world")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractSentence("")).toBeNull();
  });

  it("returns null when punctuation is followed by a non-space character (e.g. decimal)", () => {
    expect(extractSentence("version 1.5 is out")).toBeNull();
  });

  // --- ellipsis / repeated punctuation ---

  it("treats '...' as a single sentence terminator", () => {
    expect(extractSentence("Hmm... okay")).toEqual(["Hmm...", "okay"]);
  });

  it("treats '?!' as a single sentence terminator", () => {
    expect(extractSentence("Really?! Yes")).toEqual(["Really?!", "Yes"]);
  });

  // --- SSML tag awareness ---

  it("does not split on '.' inside an SSML tag", () => {
    expect(extractSentence('<break time="0.5s"/> Hello')).toBeNull();
  });

  it("does not split on '.' inside a self-closing SSML tag", () => {
    expect(extractSentence('<speed ratio="0.8"/> Hello')).toBeNull();
  });

  it("splits on '.' that follows a closed SSML tag", () => {
    expect(extractSentence('<break time="0.5s"/> Hello. World')).toEqual([
      '<break time="0.5s"/> Hello.',
      "World",
    ]);
  });

  it("returns null when buffer ends mid-angle-tag", () => {
    expect(extractSentence("Hello <break time=")).toBeNull();
  });

  // --- bracket tag awareness ([laughs], [sighs]) ---

  it("does not split on '.' inside a bracket tag", () => {
    expect(extractSentence("[laughs.] Hello")).toBeNull();
  });

  it("splits on '.' after a closed bracket tag", () => {
    expect(extractSentence("[laughs] Sure. Okay")).toEqual(["[laughs] Sure.", "Okay"]);
  });

  it("returns null when buffer ends mid-bracket-tag", () => {
    expect(extractSentence("Hello [laugh")).toBeNull();
  });
});
