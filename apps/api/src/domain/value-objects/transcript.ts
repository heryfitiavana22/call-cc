export class Transcript {
  readonly text: string;
  readonly isFinal: boolean;

  constructor(text: string, isFinal = true) {
    this.text = text.trim();
    this.isFinal = isFinal;
  }

  get isEmpty(): boolean {
    return this.text.length === 0;
  }
}
