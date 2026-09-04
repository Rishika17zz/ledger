import { describe, expect, it } from "vitest";
import { scoreAttention } from "../src/change-detection/scoring.js";
import { tierForScore } from "../src/change-detection/tiers.js";
import type { MarketEvent, Quote, Snapshot } from "../src/types/index.js";

const NOW = new Date("2026-01-02T12:00:00.000Z");

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    symbol: "ARDX",
    price: 100,
    timestamp: NOW.toISOString(),
    volume: 1_000_000,
    averageVolume: 1_000_000,
    trailingVolatility: 0.3,
    quality: { status: "live", lastUpdated: NOW.toISOString() },
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    userId: "u1",
    symbol: "ARDX",
    price: 100,
    timestamp: new Date(NOW.getTime() - 24 * 3_600_000).toISOString(),
    ...overrides,
  };
}

describe("scoreAttention", () => {
  it("is quiet with no meaningful move, no events, and live data", () => {
    const result = scoreAttention({
      quote: makeQuote({ price: 100.1 }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    expect(result.tier).toBe("quiet");
  });

  it("escalates tier as the volatility-relative move grows, holding volume constant", () => {
    const small = scoreAttention({
      quote: makeQuote({ price: 101 }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    const large = scoreAttention({
      quote: makeQuote({ price: 130 }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    expect(large.score).toBeGreaterThan(small.score);
  });

  it("scores the same raw percent move as more significant on a low-volatility symbol", () => {
    const lowVol = scoreAttention({
      quote: makeQuote({ price: 102, trailingVolatility: 0.1 }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    const highVol = scoreAttention({
      quote: makeQuote({ price: 102, trailingVolatility: 0.8 }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    expect(Math.abs(lowVol.components.volatilityZScore)).toBeGreaterThan(
      Math.abs(highVol.components.volatilityZScore),
    );
    expect(lowVol.score).toBeGreaterThan(highVol.score);
  });

  it("gives different verdicts to two users based on their own last-seen time", () => {
    const recentVisitor = scoreAttention({
      quote: makeQuote({ price: 103 }),
      since: makeSnapshot({ price: 100, timestamp: new Date(NOW.getTime() - 3_600_000).toISOString() }),
      events: [],
      now: NOW,
    });
    const staleVisitor = scoreAttention({
      quote: makeQuote({ price: 103 }),
      since: makeSnapshot({ price: 100, timestamp: new Date(NOW.getTime() - 30 * 24 * 3_600_000).toISOString() }),
      events: [],
      now: NOW,
    });
    // Same raw move, but far more surprising within 1 hour than within 30 days.
    expect(Math.abs(recentVisitor.components.volatilityZScore)).toBeGreaterThan(
      Math.abs(staleVisitor.components.volatilityZScore),
    );
    expect(recentVisitor.tier).not.toBe(staleVisitor.tier);
  });

  it("boosts score when a price move is confirmed by abnormal volume", () => {
    const lowVolume = scoreAttention({
      quote: makeQuote({ price: 108, volume: 1_000_000, averageVolume: 1_000_000 }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    const highVolume = scoreAttention({
      quote: makeQuote({ price: 108, volume: 4_600_000, averageVolume: 1_000_000 }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    expect(highVolume.score).toBeGreaterThan(lowVolume.score);
    expect(highVolume.reason).toMatch(/average volume/);
  });

  it("flags a labeled event as meaningful independent of price delta", () => {
    const events: MarketEvent[] = [
      {
        id: "evt_1",
        symbol: "ARDX",
        type: "earnings",
        timestamp: NOW.toISOString(),
        headline: "Beat earnings estimates",
        weight: 0.85,
      },
    ];
    const result = scoreAttention({
      quote: makeQuote({ price: 100.05 }),
      since: makeSnapshot({ price: 100 }),
      events,
      now: NOW,
    });
    expect(result.tier).not.toBe("quiet");
    expect(result.reason).toMatch(/Beat earnings estimates/);
  });

  it("surfaces disputed data quality as its own signal even without a price move", () => {
    const result = scoreAttention({
      quote: makeQuote({ price: 100, quality: { status: "disputed", lastUpdated: NOW.toISOString(), disputedSources: [] } }),
      since: makeSnapshot({ price: 100 }),
      events: [],
      now: NOW,
    });
    expect(result.components.qualityPenalty).toBeGreaterThan(0);
    expect(result.quote.quality.status).toBe("disputed");
  });

  it("treats a first-ever view as quiet with no prior snapshot to compare", () => {
    const result = scoreAttention({
      quote: makeQuote({ price: 250 }),
      since: null,
      events: [],
      now: NOW,
    });
    expect(result.since).toBeNull();
    expect(result.tier).toBe("quiet");
    expect(result.reason).toMatch(/First time tracking/);
  });
});

describe("tierForScore", () => {
  it("orders thresholds consistently", () => {
    expect(tierForScore(0)).toBe("quiet");
    expect(tierForScore(1.5)).toBe("notable");
    expect(tierForScore(3)).toBe("needs-attention");
  });
});
