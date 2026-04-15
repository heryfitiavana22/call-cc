export class Transcript {
  readonly text: string;
  readonly isFinal: boolean;

  constructor(text: string, isFinal = true) {
    if (!text.trim()) throw new Error("Transcript text cannot be empty");
    this.text = text.trim();
    this.isFinal = isFinal;
  }
}
