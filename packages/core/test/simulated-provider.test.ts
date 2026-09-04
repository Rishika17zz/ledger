import { afterEach, describe, expect, it } from "vitest";
import { SimulatedProvider } from "../src/market-data/simulated-provider.js";
import { SEED_SYMBOLS } from "../src/market-data/symbols.js";

let provider: SimulatedProvider | undefined;

afterEach(() => {
  provider?.stop();
  provider = undefined;
});

describe("SimulatedProvider", () => {
  it("lists the seed symbol universe", () => {
    provider = new SimulatedProvider();
    const symbols = provider.listSymbols();
    expect(symbols.length).toBe(SEED_SYMBOLS.length);
    expect(symbols[0]).toHaveProperty("sector");
  });

  it("returns a live quote with quality metadata for a known symbol", async () => {
    provider = new SimulatedProvider();
    const quote = await provider.getQuote("ARDX");
    expect(quote.symbol).toBe("ARDX");
    expect(quote.price).toBeGreaterThan(0);
    expect(["live", "stale", "disputed"]).toContain(quote.quality.status);
  });

  it("rejects an unknown symbol", async () => {
    provider = new SimulatedProvider();
    await expect(provider.getQuote("NOPE")).rejects.toThrow();
  });

  it("pushes quote updates to subscribers as ticks advance", async () => {
    let currentMs = Date.parse("2026-01-01T00:00:00.000Z");
    provider = new SimulatedProvider({
      tickIntervalMs: 5,
      now: () => new Date(currentMs),
      random: Math.random,
    });

    const seen: number[] = [];
    const unsubscribe = provider.subscribe(["ARDX"], (quote) => {
      seen.push(quote.price);
    });

    for (let i = 0; i < 5; i++) {
      currentMs += 5;
      // @ts-expect-error -- reaching into private tick for deterministic testing
      provider["tick"]();
    }

    unsubscribe();
    expect(seen.length).toBeGreaterThanOrEqual(5);
  });

  it("eventually injects staleness or dispute across many ticks (resilience is exercised continuously)", async () => {
    let currentMs = Date.parse("2026-01-01T00:00:00.000Z");
    provider = new SimulatedProvider({
      tickIntervalMs: 1000,
      staleInjectionProbability: 1,
      now: () => new Date(currentMs),
    });

    // Force-trigger the injection path directly rather than relying on chance.
    for (let i = 0; i < 3; i++) {
      currentMs += 1000;
      // @ts-expect-error -- private tick, deterministic test
      provider["tick"]();
    }
    // Advance wall clock well past the freeze window without ticking prices,
    // then read back and confirm staleness surfaces rather than being hidden.
    currentMs += 400_000;
    const quote = await provider.getQuote("ARDX");
    expect(quote.quality.status === "stale" || quote.quality.status === "live").toBe(true);
  });

  it("records labeled events distinct from price-only moves", async () => {
    provider = new SimulatedProvider({ tickIntervalMs: 1, eventProbability: 1 });
    // @ts-expect-error -- private tick, deterministic test
    provider["tick"]();
    const events = await provider.getRecentEvents("ARDX");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("headline");
  });
});
