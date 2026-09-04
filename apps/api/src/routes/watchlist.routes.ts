import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@ledger/database";
import { TIER_ORDER } from "@ledger/core";
import { requireAuth } from "../auth/auth.plugin.js";
import type { AttentionService } from "../market/attention-service.js";
import type { MarketEngine } from "../market/engine.js";

const AddSymbolSchema = z.object({ symbol: z.string().min(1).max(10) });

export function watchlistRoutes(engine: MarketEngine, attentionService: AttentionService) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.addHook("preHandler", requireAuth);

    app.get("/api/watchlist", async (request, reply) => {
      const items = await prisma.watchlistItem.findMany({
        where: { userId: request.user!.id },
        orderBy: { addedAt: "asc" },
      });
      return reply.send(items.map((i) => ({ symbol: i.symbol, addedAt: i.addedAt.toISOString() })));
    });

    app.post("/api/watchlist", async (request, reply) => {
      const parsed = AddSymbolSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "A symbol is required." });
      }
      const symbol = parsed.data.symbol.toUpperCase();
      const known = engine.listSymbols().some((s) => s.symbol === symbol);
      if (!known) {
        return reply.code(404).send({ error: `${symbol} isn't a tracked symbol.` });
      }

      const existing = await prisma.watchlistItem.findUnique({
        where: { userId_symbol: { userId: request.user!.id, symbol } },
      });
      if (existing) {
        return reply.code(200).send({ symbol, addedAt: existing.addedAt.toISOString() });
      }

      const item = await prisma.watchlistItem.create({
        data: { userId: request.user!.id, symbol },
      });
      await engine.ensureSubscribed(symbol);
      return reply.code(201).send({ symbol: item.symbol, addedAt: item.addedAt.toISOString() });
    });

    app.delete("/api/watchlist/:symbol", async (request, reply) => {
      const symbol = (request.params as { symbol: string }).symbol.toUpperCase();
      const deleted = await prisma.watchlistItem.deleteMany({
        where: { userId: request.user!.id, symbol },
      });
      if (deleted.count > 0) {
        engine.release(symbol);
        await prisma.snapshot.deleteMany({ where: { userId: request.user!.id, symbol } });
      }
      return reply.code(204).send();
    });

    /**
     * The "what changed since I last looked" endpoint. Scores every watchlist
     * symbol against this user's stored snapshot, then advances the snapshot
     * to now -- this call *is* what "a visit" means in this product.
     */
    app.get("/api/watchlist/attention", async (request, reply) => {
      const items = await prisma.watchlistItem.findMany({
        where: { userId: request.user!.id },
      });
      const results = await attentionService.checkpoint(
        request.user!.id,
        items.map((i) => i.symbol),
      );
      const sorted = [...results].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
      return reply.send(sorted);
    });
  };
}
