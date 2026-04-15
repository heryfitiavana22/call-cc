import type { CallState } from "@call-cc/types";

export class VoiceSession {
  readonly id: string;
  private _state: CallState;
  readonly createdAt: Date;

  constructor(id: string) {
    this.id = id;
    this._state = "idle";
    this.createdAt = new Date();
  }

  get state(): CallState {
    return this._state;
  }

  transition(next: CallState): void {
    this._state = next;
  }

  isActive(): boolean {
    return this._state !== "idle";
  }
}
