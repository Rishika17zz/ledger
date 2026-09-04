import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { prisma } from "@ledger/database";
import type { AttentionService } from "../market/attention-service.js";
import type { MarketEngine } from "../market/engine.js";

interface ClientMessage {
  type: "subscribe";
  symbols: string[];
}

/**
 * One WebSocket connection per browser tab, but zero additional upstream
 * market-data subscriptions: this handler only ever attaches listeners to
 * channels the MarketEngine already owns (see engine.ts). Live pushes use
 * `computeForSymbol`, not `checkpoint`, so an open tab shows the score move
 * in real time against a fixed last-visit baseline rather than resetting it
 * on every tick.
 */
export function registerWsGateway(
  app: FastifyInstance,
  engine: MarketEngine,
  attentionService: AttentionService,
): void {
  app.get("/ws", { websocket: true }, (socket: WebSocket, request) => {
    if (!request.user) {
      socket.close(4001, "Not authenticated");
      return;
    }
    const userId = request.user.id;
    const unsubscribes = new Map<string, () => void>();

    const subscribeTo = (symbol: string) => {
      if (unsubscribes.has(symbol)) return;
      const unsubscribe = engine.onQuote(symbol, () => {
        void attentionService.computeForSymbol(userId, symbol).then((result) => {
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: "attention", data: result }));
          }
        });
      });
      unsubscribes.set(symbol, unsubscribe);
    };

    const unsubscribeFrom = (symbol: string) => {
      unsubscribes.get(symbol)?.();
      unsubscribes.delete(symbol);
    };

    const syncSymbols = (symbols: string[]) => {
      const desired = new Set(symbols.map((s) => s.toUpperCase()));
      for (const symbol of unsubscribes.keys()) {
        if (!desired.has(symbol)) unsubscribeFrom(symbol);
      }
      for (const symbol of desired) {
        subscribeTo(symbol);
      }
    };

    void prisma.watchlistItem
      .findMany({ where: { userId } })
      .then((items) => syncSymbols(items.map((i) => i.symbol)));

    socket.on("message", (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage;
        if (message.type === "subscribe" && Array.isArray(message.symbols)) {
          syncSymbols(message.symbols);
        }
      } catch {
        // Ignore malformed client messages rather than tearing down the socket.
      }
    });

    socket.on("close", () => {
      for (const symbol of [...unsubscribes.keys()]) unsubscribeFrom(symbol);
    });
  });
}
