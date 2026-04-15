import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import { env } from "@/config/env";
import { createVoiceRoute } from "@/presentation/routes/voice-route";
import { container } from "@/container";
import { logger } from "@/shared/logger";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.route("/voice", createVoiceRoute(container, upgradeWebSocket));

app.get("/health", (c) => c.json({ status: "ok" }));

const server = serve({ fetch: app.fetch, port: env.PORT }, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API server started");
});

injectWebSocket(server);
