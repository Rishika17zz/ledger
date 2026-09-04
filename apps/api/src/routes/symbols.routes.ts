import type { FastifyInstance } from "fastify";
import type { MarketEngine } from "../market/engine.js";

export function symbolsRoutes(engine: MarketEngine) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.get("/api/symbols", async (_request, reply) => {
      return reply.send(engine.listSymbols());
    });
  };
}
