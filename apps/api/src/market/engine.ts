import { EventEmitter } from "node:events";
import type { MarketDataProvider, MarketEvent, Quote } from "@ledger/core";
import type { CacheProvider } from "../cache/index.js";
import { CACHE_KEYS } from "../cache/index.js";

const QUOTE_CACHE_TTL_MS = 30_000;

/**
 * Owns the *single* upstream subscription per symbol and fans it out to
 * every interested consumer (WebSocket connections, cache writes). This is
 * the piece that makes ingestion cost scale with unique symbols tracked
 * across all users rather than with user or connection count: whether one
 * person or ten thousand are watching ARDX, the provider sees exactly one
 * subscription for it, ref-counted against how many watchlists it appears
 * on. See README "Scaling story".
 */
export class MarketEngine {
  private readonly refCounts = new Map<string, number>();
  private readonly providerUnsubscribes = new Map<string, () => void>();
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly provider: MarketDataProvider,
    private readonly cache: CacheProvider,
  ) {
    this.emitter.setMaxListeners(0);
    provider.onEvent((event) => {
      this.emitter.emit(eventChannel(event.symbol), event);
    });
  }

  /** Bulk-subscribes to every symbol currently tracked by at least one watchlist. Call once at startup. */
  async bootstrap(symbols: string[]): Promise<void> {
    const unique = [...new Set(symbols)];
    await Promise.all(unique.map((symbol) => this.ensureSubscribed(symbol)));
  }

  /** Increments the ref count for a symbol, opening the upstream subscription on the 0->1 transition. */
  async ensureSubscribed(symbol: string): Promise<void> {
    const count = this.refCounts.get(symbol) ?? 0;
    this.refCounts.set(symbol, count + 1);
    if (count === 0) {
      const unsubscribe = this.provider.subscribe([symbol], (quote) => {
        void this.cache.set(CACHE_KEYS.quote(symbol), quote, QUOTE_CACHE_TTL_MS);
        this.emitter.emit(quoteChannel(symbol), quote);
      });
      this.providerUnsubscribes.set(symbol, unsubscribe);
      // Prime the cache immediately rather than waiting for the next tick.
      const quote = await this.provider.getQuote(symbol);
      await this.cache.set(CACHE_KEYS.quote(symbol), quote, QUOTE_CACHE_TTL_MS);
    }
  }

  /** Decrements the ref count, closing the upstream subscription once nobody needs it. */
  release(symbol: string): void {
    const count = this.refCounts.get(symbol) ?? 0;
    if (count <= 1) {
      this.refCounts.delete(symbol);
      this.providerUnsubscribes.get(symbol)?.();
      this.providerUnsubscribes.delete(symbol);
    } else {
      this.refCounts.set(symbol, count - 1);
    }
  }

  activeSubscriptionCount(): number {
    return this.refCounts.size;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const cached = await this.cache.get<Quote>(CACHE_KEYS.quote(symbol));
    if (cached) return cached;
    const quote = await this.provider.getQuote(symbol);
    await this.cache.set(CACHE_KEYS.quote(symbol), quote, QUOTE_CACHE_TTL_MS);
    return quote;
  }

  async getEvents(symbol: string, sinceISO?: string): Promise<MarketEvent[]> {
    return this.provider.getRecentEvents(symbol, sinceISO);
  }

  listSymbols() {
    return this.provider.listSymbols();
  }

  /** Fan-out point: attach a listener for live quote ticks on a symbol without opening a new upstream subscription. */
  onQuote(symbol: string, listener: (quote: Quote) => void): () => void {
    this.emitter.on(quoteChannel(symbol), listener);
    return () => this.emitter.off(quoteChannel(symbol), listener);
  }

  onSymbolEvent(symbol: string, listener: (event: MarketEvent) => void): () => void {
    this.emitter.on(eventChannel(symbol), listener);
    return () => this.emitter.off(eventChannel(symbol), listener);
  }
}

function quoteChannel(symbol: string): string {
  return `quote:${symbol}`;
}

function eventChannel(symbol: string): string {
  return `event:${symbol}`;
}
