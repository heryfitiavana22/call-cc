import { z } from "zod";

/**
 * WebSocket protocol between frontend and backend.
 * All messages are JSON except audio chunks (ArrayBuffer).
 */

// — Zod schemas (used for runtime validation) —

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("interrupt") }),
  z.object({ type: z.literal("session.start") }),
  z.object({ type: z.literal("session.end") }),
  // Sent by the frontend when speech ends (VAD or silence detection)
  z.object({ type: z.literal("speech.end") }),
]);

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("transcript"), text: z.string(), final: z.boolean() }),
  z.object({ type: z.literal("agent.reply"), text: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("session.started") }),
  z.object({ type: z.literal("session.ended") }),
]);

// — Inferred TypeScript types —

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

// Voice session state on the frontend
export type CallState = "idle" | "listening" | "processing" | "speaking";
