import type { DataQuality, SourceQuote } from "../types/index.js";

export interface ReconciliationOptions {
  /** A quote older than this (ms) relative to `now` is considered stale. Default 90s. */
  staleAfterMs?: number;
  /** Two sources within this window (ms) of each other are compared for disagreement. Default 5s. */
  disputeWindowMs?: number;
  /** Relative price difference above which two near-simultaneous sources are "disputed". Default 0.5%. */
  disputeThresholdPct?: number;
}

const DEFAULTS: Required<ReconciliationOptions> = {
  staleAfterMs: 90_000,
  disputeWindowMs: 5_000,
  disputeThresholdPct: 0.005,
};

export interface ReconciledQuote {
  price: number;
  timestamp: string;
  quality: DataQuality;
}

/**
 * Reconciles one or more source readings for the same symbol into a single
 * displayable value plus an explicit data-quality verdict.
 *
 * Rule (documented in the README): most-recent-timestamp wins for *which*
 * value is shown. But if two sources land within a tight time window of each
 * other and disagree beyond the threshold, the value is never silently
 * picked — it's flagged `disputed` instead. A reading older than
 * `staleAfterMs` is flagged `stale` regardless of source agreement, since an
 * old value should never be presented as live.
 */
export function reconcileQuote(
  sources: SourceQuote[],
  now: Date,
  options: ReconciliationOptions = {},
): ReconciledQuote {
  if (sources.length === 0) {
    throw new Error("reconcileQuote requires at least one source reading");
  }
  const opts = { ...DEFAULTS, ...options };

  const sorted = [...sources].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const mostRecent = sorted[0]!;
  const mostRecentMs = new Date(mostRecent.timestamp).getTime();
  const ageMs = now.getTime() - mostRecentMs;

  if (ageMs > opts.staleAfterMs) {
    return {
      price: mostRecent.price,
      timestamp: mostRecent.timestamp,
      quality: {
        status: "stale",
        lastUpdated: mostRecent.timestamp,
        staleForMs: ageMs,
        note: `Feed hasn't updated in ${Math.round(ageMs / 1000)}s (expected within ${Math.round(
          opts.staleAfterMs / 1000,
        )}s).`,
      },
    };
  }

  const contemporaries = sorted.filter(
    (s) => Math.abs(new Date(s.timestamp).getTime() - mostRecentMs) <= opts.disputeWindowMs,
  );

  if (contemporaries.length > 1) {
    const prices = contemporaries.map((s) => s.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const spread = (max - min) / min;
    if (spread > opts.disputeThresholdPct) {
      return {
        price: mostRecent.price,
        timestamp: mostRecent.timestamp,
        quality: {
          status: "disputed",
          lastUpdated: mostRecent.timestamp,
          disputedSources: contemporaries,
          note: `Sources disagree by ${(spread * 100).toFixed(2)}% within ${Math.round(
            opts.disputeWindowMs / 1000,
          )}s of each other.`,
        },
      };
    }
  }

  return {
    price: mostRecent.price,
    timestamp: mostRecent.timestamp,
    quality: {
      status: "live",
      lastUpdated: mostRecent.timestamp,
    },
  };
}
