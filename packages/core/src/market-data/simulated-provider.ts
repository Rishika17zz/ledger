import { reconcileQuote } from "../change-detection/reconciliation.js";
import type { MarketEvent, MarketEventType, Quote, SourceQuote } from "../types/index.js";
import type { MarketDataProvider, SymbolMeta } from "./provider.js";
import { SEED_SYMBOLS, type SeedSymbol } from "./symbols.js";

type Regime = "calm" | "burst";

interface SymbolState {
  meta: SeedSymbol;
  price: number;
  regime: Regime;
  trailingVolatility: number;
  averageVolume: number;
  currentVolume: number;
  week52High: number;
  week52Low: number;
  primarySource: SourceQuote;
  secondarySource: SourceQuote;
  /** While set (future timestamp), the feed stops updating -> staleness. */
  frozenUntilMs: number | null;
  /** While set (future timestamp), the secondary source diverges -> dispute. */
  disputedUntilMs: number | null;
}

export interface SimulatedProviderOptions {
  /** How often the internal tick advances prices, in ms. Default 2000. */
  tickIntervalMs?: number;
  /** Probability per symbol per tick of a regime flip (calm<->burst). Default 0.03. */
  regimeFlipProbability?: number;
  /** Probability per symbol per tick of a labeled event firing. Default 0.006. */
  eventProbability?: number;
  /** Probability per symbol per tick of a staleness injection starting. Default 0.01. */
  staleInjectionProbability?: number;
  /** Probability per symbol per tick of a source-conflict injection starting. Default 0.012. */
  disputeInjectionProbability?: number;
  random?: () => number;
  now?: () => Date;
}

const DEFAULTS: Required<Omit<SimulatedProviderOptions, "random" | "now">> = {
  tickIntervalMs: 2000,
  regimeFlipProbability: 0.03,
  eventProbability: 0.006,
  staleInjectionProbability: 0.01,
  disputeInjectionProbability: 0.012,
};

const EVENT_LIBRARY: Array<{ type: MarketEventType; weight: number; headlineFor: (up: boolean) => string; priceImpact: [number, number] }> = [
  { type: "earnings", weight: 0.85, headlineFor: (up) => (up ? "Beat earnings estimates" : "Missed earnings estimates"), priceImpact: [-0.08, 0.08] },
  { type: "guidance-change", weight: 0.7, headlineFor: (up) => (up ? "Raised forward guidance" : "Cut forward guidance"), priceImpact: [-0.06, 0.06] },
  { type: "analyst-upgrade", weight: 0.45, headlineFor: () => "Upgraded by a major analyst", priceImpact: [0.01, 0.035] },
  { type: "analyst-downgrade", weight: 0.45, headlineFor: () => "Downgraded by a major analyst", priceImpact: [-0.035, -0.01] },
  { type: "halt", weight: 0.95, headlineFor: () => "Trading halted pending news", priceImpact: [-0.1, 0.1] },
];

function randomNormal(random: () => number): number {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function pick<T>(arr: T[], random: () => number): T {
  const item = arr[Math.floor(random() * arr.length)];
  if (item === undefined) throw new Error("pick() called on empty array");
  return item;
}

let eventCounter = 0;

export class SimulatedProvider implements MarketDataProvider {
  private readonly opts: Required<Omit<SimulatedProviderOptions, "random" | "now">>;
  private readonly random: () => number;
  private readonly now: () => Date;
  private readonly states = new Map<string, SymbolState>();
  private readonly quoteListeners = new Map<string, Set<(q: Quote) => void>>();
  private readonly eventListeners = new Set<(e: MarketEvent) => void>();
  private readonly eventLog = new Map<string, MarketEvent[]>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SimulatedProviderOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());

    for (const meta of SEED_SYMBOLS) {
      const timestamp = this.now().toISOString();
      const source: SourceQuote = { source: "primary-feed", price: meta.basePrice, timestamp };
      this.states.set(meta.symbol, {
        meta,
        price: meta.basePrice,
        regime: "calm",
        trailingVolatility: meta.calmVolatility,
        averageVolume: meta.baseVolume,
        currentVolume: meta.baseVolume,
        week52High: meta.basePrice * 1.15,
        week52Low: meta.basePrice * 0.85,
        primarySource: source,
        secondarySource: { ...source, source: "secondary-feed" },
        frozenUntilMs: null,
        disputedUntilMs: null,
      });
      this.eventLog.set(meta.symbol, []);
    }

    this.start();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.opts.tickIntervalMs);
    if (typeof this.timer === "object" && "unref" in this.timer) {
      (this.timer as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  listSymbols(): SymbolMeta[] {
    return SEED_SYMBOLS.map(({ symbol, name, sector }) => ({ symbol, name, sector }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const state = this.states.get(symbol);
    if (!state) throw new Error(`Unknown symbol: ${symbol}`);
    return this.buildQuote(state);
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }

  async getRecentEvents(symbol: string, sinceISO?: string): Promise<MarketEvent[]> {
    const log = this.eventLog.get(symbol) ?? [];
    if (!sinceISO) return [...log];
    const sinceMs = new Date(sinceISO).getTime();
    return log.filter((e) => new Date(e.timestamp).getTime() > sinceMs);
  }

  subscribe(symbols: string[], onQuote: (quote: Quote) => void): () => void {
    for (const symbol of symbols) {
      if (!this.quoteListeners.has(symbol)) this.quoteListeners.set(symbol, new Set());
      this.quoteListeners.get(symbol)!.add(onQuote);
    }
    return () => {
      for (const symbol of symbols) {
        this.quoteListeners.get(symbol)?.delete(onQuote);
      }
    };
  }

  onEvent(listener: (event: MarketEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Advances every symbol by one simulated tick: price walk, regime, volume,
   * rare events, and randomized staleness/conflict injection. */
  private tick(): void {
    const nowDate = this.now();
    for (const state of this.states.values()) {
      this.advanceRegime(state);
      this.maybeInjectStaleness(state, nowDate);
      this.maybeInjectDispute(state, nowDate);

      const frozen = state.frozenUntilMs !== null && nowDate.getTime() < state.frozenUntilMs;
      if (!frozen) {
        this.advancePrice(state, nowDate);
        this.maybeEmitEvent(state, nowDate);
      }

      const quote = this.buildQuote(state);
      this.publish(quote);
    }
  }

  private advanceRegime(state: SymbolState): void {
    if (this.random() < this.opts.regimeFlipProbability) {
      state.regime = state.regime === "calm" ? "burst" : "calm";
    }
    const target = state.regime === "calm" ? state.meta.calmVolatility : state.meta.calmVolatility * 2.6;
    // Trailing volatility eases toward the regime's target rather than snapping,
    // which is what real vol-clustering looks like.
    state.trailingVolatility += (target - state.trailingVolatility) * 0.15;
  }

  private advancePrice(state: SymbolState, now: Date): void {
    const dtYears = this.opts.tickIntervalMs / (1000 * 60 * 60 * 24 * 365);
    const drift = -0.5 * state.trailingVolatility ** 2 * dtYears;
    const shock = state.trailingVolatility * Math.sqrt(dtYears) * randomNormal(this.random);
    state.price = Math.max(0.01, state.price * Math.exp(drift + shock));

    state.week52High = Math.max(state.week52High, state.price);
    state.week52Low = Math.min(state.week52Low, state.price);

    const volumeNoise = 0.7 + this.random() * 0.6;
    const burstMultiplier = state.regime === "burst" ? 1.8 : 1;
    state.currentVolume = Math.round(state.meta.baseVolume * volumeNoise * burstMultiplier);
    state.averageVolume += (state.currentVolume - state.averageVolume) * 0.05;

    const timestamp = now.toISOString();
    state.primarySource = { source: "primary-feed", price: state.price, timestamp };
    const secondaryNoise = state.disputedUntilMs && now.getTime() < state.disputedUntilMs ? 0.02 : 0.0006;
    const secondaryPrice = state.price * (1 + randomNormal(this.random) * secondaryNoise);
    state.secondarySource = { source: "secondary-feed", price: round2(secondaryPrice), timestamp };
  }

  private maybeInjectStaleness(state: SymbolState, now: Date): void {
    const alreadyFrozen = state.frozenUntilMs !== null && now.getTime() < state.frozenUntilMs;
    if (alreadyFrozen) return;
    state.frozenUntilMs = null;
    if (this.random() < this.opts.staleInjectionProbability) {
      const durationMs = 30_000 + this.random() * 150_000;
      state.frozenUntilMs = now.getTime() + durationMs;
    }
  }

  private maybeInjectDispute(state: SymbolState, now: Date): void {
    const alreadyDisputed = state.disputedUntilMs !== null && now.getTime() < state.disputedUntilMs;
    if (alreadyDisputed) return;
    state.disputedUntilMs = null;
    if (this.random() < this.opts.disputeInjectionProbability) {
      const durationMs = 4_000 + this.random() * 12_000;
      state.disputedUntilMs = now.getTime() + durationMs;
    }
  }

  private maybeEmitEvent(state: SymbolState, now: Date): void {
    if (this.random() < this.opts.eventProbability) {
      const template = pick(EVENT_LIBRARY, this.random);
      const up = this.random() > 0.5;
      const [lo, hi] = template.priceImpact;
      const impact = template.type === "analyst-upgrade" || template.type === "analyst-downgrade"
        ? (up ? hi : lo)
        : lo + this.random() * (hi - lo);
      state.price = Math.max(0.01, state.price * (1 + impact));
      this.recordEvent(state, template.type, template.headlineFor(impact >= 0), now);
      return;
    }

    if (state.price >= state.week52High && this.random() < 0.5) {
      this.recordEvent(state, "52w-high", `New 52-week high (${state.price.toFixed(2)})`, now);
    } else if (state.price <= state.week52Low && this.random() < 0.5) {
      this.recordEvent(state, "52w-low", `New 52-week low (${state.price.toFixed(2)})`, now);
    }
  }

  private recordEvent(state: SymbolState, type: MarketEventType, headline: string, now: Date): void {
    eventCounter += 1;
    const weight = EVENT_LIBRARY.find((e) => e.type === type)?.weight ?? 0.5;
    const event: MarketEvent = {
      id: `evt_${state.meta.symbol}_${now.getTime()}_${eventCounter}`,
      symbol: state.meta.symbol,
      type,
      timestamp: now.toISOString(),
      headline,
      weight,
    };
    const log = this.eventLog.get(state.meta.symbol) ?? [];
    log.push(event);
    if (log.length > 200) log.shift();
    this.eventLog.set(state.meta.symbol, log);
    for (const listener of this.eventListeners) listener(event);
  }

  private buildQuote(state: SymbolState): Quote {
    const nowDate = this.now();
    const sources = [state.primarySource, state.secondarySource];
    const reconciled = reconcileQuote(sources, nowDate);
    return {
      symbol: state.meta.symbol,
      price: round2(reconciled.price),
      timestamp: reconciled.timestamp,
      volume: state.currentVolume,
      averageVolume: Math.round(state.averageVolume),
      trailingVolatility: state.trailingVolatility,
      quality: reconciled.quality,
    };
  }

  private publish(quote: Quote): void {
    const listeners = this.quoteListeners.get(quote.symbol);
    if (!listeners || listeners.size === 0) return;
    for (const listener of listeners) listener(quote);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
