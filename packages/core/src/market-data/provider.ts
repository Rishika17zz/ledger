import type { MarketEvent, Quote } from "../types/index.js";

export interface SymbolMeta {
  symbol: string;
  name: string;
  sector: string;
}

/**
 * Provider-agnostic market data interface. Everything downstream (scoring,
 * API, WebSocket fanout) depends only on this contract, never on the
 * simulator directly — a real provider (Finnhub, Alpha Vantage, Twelve
 * Data, ...) can implement this and be swapped in with a one-line change
 * at the composition root. See README "Market data source" for the swap
 * plan.
 */
export interface MarketDataProvider {
  /** The tradable symbol universe this provider knows about. */
  listSymbols(): SymbolMeta[];

  /** Latest reconciled quote for a symbol. Throws if the symbol is unknown. */
  getQuote(symbol: string): Promise<Quote>;

  /** Latest reconciled quotes for several symbols at once. */
  getQuotes(symbols: string[]): Promise<Quote[]>;

  /** Labeled events for a symbol, optionally only those after `sinceISO`. */
  getRecentEvents(symbol: string, sinceISO?: string): Promise<MarketEvent[]>;

  /**
   * Subscribes to live quote updates for a set of symbols. This is the one
   * upstream subscription per symbol the whole fanout architecture is built
   * around — see README "Scaling story". Returns an unsubscribe function.
   */
  subscribe(symbols: string[], onQuote: (quote: Quote) => void): () => void;

  /** Subscribes to newly labeled events across all symbols. */
  onEvent(listener: (event: MarketEvent) => void): () => void;
}
