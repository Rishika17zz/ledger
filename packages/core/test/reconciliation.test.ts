import { describe, expect, it } from "vitest";
import { reconcileQuote } from "../src/change-detection/reconciliation.js";
import type { SourceQuote } from "../src/types/index.js";

const NOW = new Date("2026-01-01T12:00:00.000Z");

function src(source: string, price: number, offsetMs: number): SourceQuote {
  return {
    source,
    price,
    timestamp: new Date(NOW.getTime() + offsetMs).toISOString(),
  };
}

describe("reconcileQuote", () => {
  it("returns live when a single fresh source is within the update window", () => {
    const result = reconcileQuote([src("primary", 100, -1000)], NOW);
    expect(result.quality.status).toBe("live");
    expect(result.price).toBe(100);
  });

  it("flags stale when the most recent reading is older than staleAfterMs", () => {
    const result = reconcileQuote([src("primary", 100, -200_000)], NOW, { staleAfterMs: 90_000 });
    expect(result.quality.status).toBe("stale");
    expect(result.quality.staleForMs).toBeGreaterThanOrEqual(200_000);
  });

  it("picks the most-recent-timestamp source when sources agree", () => {
    const result = reconcileQuote(
      [src("primary", 100, -10_000), src("secondary", 100.05, -500)],
      NOW,
    );
    expect(result.price).toBe(100.05);
    expect(result.quality.status).toBe("live");
  });

  it("flags disputed when near-simultaneous sources disagree beyond the threshold", () => {
    const result = reconcileQuote(
      [src("primary", 100, -500), src("secondary", 103, -400)],
      NOW,
      { disputeWindowMs: 5000, disputeThresholdPct: 0.005 },
    );
    expect(result.quality.status).toBe("disputed");
    expect(result.quality.disputedSources).toHaveLength(2);
    // Still shows a value (most-recent-wins, secondary at -400ms) rather than silently omitting it.
    expect(result.price).toBe(103);
  });

  it("does not flag disputed when disagreeing sources fall outside the tight time window", () => {
    const result = reconcileQuote(
      [src("primary", 100, -60_000), src("secondary", 103, -500)],
      NOW,
      { disputeWindowMs: 5000, disputeThresholdPct: 0.005, staleAfterMs: 90_000 },
    );
    expect(result.quality.status).toBe("live");
  });

  it("prefers staleness over dispute when the most recent reading is itself old", () => {
    const result = reconcileQuote(
      [src("primary", 100, -200_000), src("secondary", 130, -195_000)],
      NOW,
      { staleAfterMs: 90_000, disputeWindowMs: 10_000, disputeThresholdPct: 0.005 },
    );
    expect(result.quality.status).toBe("stale");
  });

  it("throws on an empty source list", () => {
    expect(() => reconcileQuote([], NOW)).toThrow();
  });
});
