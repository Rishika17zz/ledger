import { prisma } from "@ledger/database";
import { scoreAttention, type AttentionResult, type Snapshot } from "@ledger/core";
import type { MarketEngine } from "./engine.js";

/**
 * Bridges the market engine (quotes/events) with durable per-user snapshots
 * and the scoring engine. Two distinct operations, deliberately kept
 * separate:
 *
 *  - `computeForSymbol` scores against whatever snapshot is currently
 *    stored, without moving it. Used for live WebSocket ticks, so a score
 *    can keep updating in real time against a fixed "since you opened this"
 *    baseline for the duration of a session.
 *  - `checkpoint` does the same, then advances the snapshot to now. This is
 *    what a "visit" means: it's called once when the watchlist is loaded,
 *    and the new baseline is what the *next* visit will be compared against.
 */
export class AttentionService {
  constructor(private readonly engine: MarketEngine) {}

  async computeForSymbol(userId: string, symbol: string, now = new Date()): Promise<AttentionResult> {
    const [quote, snapshotRow] = await Promise.all([
      this.engine.getQuote(symbol),
      prisma.snapshot.findUnique({ where: { userId_symbol: { userId, symbol } } }),
    ]);
    const since: Snapshot | null = snapshotRow
      ? {
          userId,
          symbol,
          price: snapshotRow.price,
          timestamp: snapshotRow.timestamp.toISOString(),
        }
      : null;
    const events = await this.engine.getEvents(symbol, since?.timestamp);
    return scoreAttention({ quote, since, events, now });
  }

  async checkpoint(userId: string, symbols: string[], now = new Date()): Promise<AttentionResult[]> {
    const results = await Promise.all(
      symbols.map((symbol) => this.computeForSymbol(userId, symbol, now)),
    );
    await Promise.all(
      results.map((result) =>
        prisma.snapshot.upsert({
          where: { userId_symbol: { userId, symbol: result.symbol } },
          update: { price: result.quote.price, timestamp: new Date(result.quote.timestamp) },
          create: {
            userId,
            symbol: result.symbol,
            price: result.quote.price,
            timestamp: new Date(result.quote.timestamp),
          },
        }),
      ),
    );
    return results;
  }
}
