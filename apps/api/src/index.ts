import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import { env } from "./config/env.js";
import { createVoiceRoute } from "./presentation/routes/voice-route.js";
import { container } from "./container.js";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.route("/voice", createVoiceRoute(container, upgradeWebSocket));

app.get("/health", (c) => c.json({ status: "ok" }));

const PORT = env.PORT;

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`API running on http://localhost:${PORT}`);
});

injectWebSocket(server);
