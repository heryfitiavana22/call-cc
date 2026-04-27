/**
 * Extracts the first complete sentence from the buffer.
 * Returns [sentence, remainder] or null if no complete sentence yet.
 *
 * Tag-aware: does not split on punctuation that appears inside SSML tags
 * (<speed ratio="0.5"/>, <break time="0.5s"/>) or inline audio tags ([laughs]).
 * If the buffer ends mid-tag, returns null and waits for more tokens.
 */
export const extractSentence = (buffer: string): [string, string] | null => {
  let inAngle = false; // inside <...>
  let inBracket = false; // inside [...]

  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];

    if (!inAngle && !inBracket) {
      if (ch === "<") {
        inAngle = true;
      } else if (ch === "[") {
        inBracket = true;
      } else if (ch === "." || ch === "!" || ch === "?") {
        // Consume any trailing punctuation of the same kind (e.g. "...")
        let j = i + 1;
        while (j < buffer.length && (buffer[j] === "." || buffer[j] === "!" || buffer[j] === "?"))
          j++;
        // Only flush if followed by whitespace or end of buffer
        if (j >= buffer.length || buffer[j] === " " || buffer[j] === "\n") {
          const sentence = buffer.slice(0, j).trim();
          const remainder = buffer.slice(j).trimStart();
          return sentence.length > 0 ? [sentence, remainder] : null;
        }
      }
    } else if (inAngle && ch === ">") {
      inAngle = false;
    } else if (inBracket && ch === "]") {
      inBracket = false;
    }
  }

  return null;
};
