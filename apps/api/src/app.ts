import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAuth } from "./auth/auth.plugin.js";
import { env } from "./env.js";
import { AttentionService } from "./market/attention-service.js";
import { MarketEngine } from "./market/engine.js";
import { authRoutes } from "./routes/auth.routes.js";
import { symbolsRoutes } from "./routes/symbols.routes.js";
import { watchlistRoutes } from "./routes/watchlist.routes.js";
import { registerWsGateway } from "./ws/gateway.js";

export interface AppDependencies {
  engine: MarketEngine;
}

export async function buildApp({ engine }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : env.NODE_ENV === "development"
          ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
          : true,
  });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(websocket);

  registerAuth(app);

  const attentionService = new AttentionService(engine);

  await app.register(authRoutes);
  await app.register(symbolsRoutes(engine));
  await app.register(watchlistRoutes(engine, attentionService));
  registerWsGateway(app, engine, attentionService);

  app.get("/api/health", async () => ({
    status: "ok",
    activeSubscriptions: engine.activeSubscriptionCount(),
  }));

  return app;
}
