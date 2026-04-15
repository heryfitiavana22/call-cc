import { Hono } from "hono";
import type { NodeWebSocket } from "@hono/node-ws";
import type { WSContext } from "hono/ws";
import { AudioStreamHandler } from "../websocket/audio-stream-handler.js";
import type { AppContainer } from "../../container.js";

export const createVoiceRoute = (
  container: AppContainer,
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"],
) => {
  const app = new Hono();

  app.get(
    "/ws",
    upgradeWebSocket(() => {
      const handler = new AudioStreamHandler(
        container.startVoiceSession,
        container.processAudioChunk,
        container.endVoiceSession,
      );

      return {
        onOpen: (_event: Event, ws: WSContext) => handler.onOpen(ws),
        onMessage: (event: MessageEvent, ws: WSContext) => handler.onMessage(ws, event.data),
        onClose: () => handler.onClose(),
      };
    }),
  );

  return app;
};
