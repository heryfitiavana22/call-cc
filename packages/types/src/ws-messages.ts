/**
 * Protocol WebSocket entre le frontend et le backend.
 * Tous les messages transitent en JSON sauf les chunks audio (ArrayBuffer).
 */

// Client → Server
export type ClientMessage =
  | { type: "interrupt" }
  | { type: "session.start" }
  | { type: "session.end" };

// Server → Client
export type ServerMessage =
  | { type: "ready" }
  | { type: "transcript"; text: string; final: boolean }
  | { type: "error"; message: string }
  | { type: "session.started" }
  | { type: "session.ended" };

// État de la session vocale côté frontend
export type CallState = "idle" | "listening" | "processing" | "speaking";
