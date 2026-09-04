import type { AttentionResult, MarketEvent, Quote, ScoreComponents, Snapshot } from "../types/index.js";
import { tierForScore } from "./tiers.js";

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_YEAR = 24 * 365;
/** Floor the elapsed-time-scaled volatility window at 5 minutes so a move in the
 * last few seconds/minutes doesn't produce an absurdly large z-score from noise. */
const MIN_PERIOD_HOURS = 5 / 60;

const WEIGHTS = {
  volumeBoostPerRatio: 0.15,
  volumeBoostCap: 4,
  eventMultiplier: 3,
  staleQualityScore: 0.75,
  disputedQualityScore: 1.5,
} as const;

export interface ScoreInput {
  quote: Quote;
  /** The user's last-seen snapshot for this symbol, or null if never seen before. */
  since: Snapshot | null;
  /** Labeled events that occurred since the snapshot (or ever, if since is null). */
  events: MarketEvent[];
  now: Date;
}

function computeComponents(input: ScoreInput): ScoreComponents {
  const { quote, since, events, now } = input;

  if (!since) {
    return {
      volatilityZScore: 0,
      percentChange: 0,
      volumeRatio: quote.averageVolume > 0 ? quote.volume / quote.averageVolume : 1,
      hoursSinceLastVisit: 0,
      eventWeight: sumEventWeight(events),
      qualityPenalty: qualityPenalty(quote),
    };
  }

  const hoursSinceLastVisit = Math.max(
    0,
    (now.getTime() - new Date(since.timestamp).getTime()) / MS_PER_HOUR,
  );
  const percentChange = (quote.price - since.price) / since.price;

  const periodHours = Math.max(hoursSinceLastVisit, MIN_PERIOD_HOURS);
  const periodVolatility = quote.trailingVolatility * Math.sqrt(periodHours / HOURS_PER_YEAR);
  const volatilityZScore = periodVolatility > 0 ? percentChange / periodVolatility : 0;

  const volumeRatio = quote.averageVolume > 0 ? quote.volume / quote.averageVolume : 1;

  return {
    volatilityZScore,
    percentChange,
    volumeRatio,
    hoursSinceLastVisit,
    eventWeight: sumEventWeight(events),
    qualityPenalty: qualityPenalty(quote),
  };
}

function sumEventWeight(events: MarketEvent[]): number {
  return events.reduce((sum, e) => sum + e.weight, 0);
}

function qualityPenalty(quote: Quote): number {
  if (quote.quality.status === "disputed") return WEIGHTS.disputedQualityScore;
  if (quote.quality.status === "stale") return WEIGHTS.staleQualityScore;
  return 0;
}

function compositeScore(c: ScoreComponents): number {
  const volumeMultiplier =
    1 + Math.min(Math.max(c.volumeRatio - 1, 0), WEIGHTS.volumeBoostCap) * WEIGHTS.volumeBoostPerRatio;
  const moveScore = Math.abs(c.volatilityZScore) * volumeMultiplier;
  const eventScore = c.eventWeight * WEIGHTS.eventMultiplier;
  return moveScore + eventScore + c.qualityPenalty;
}

function formatPct(n: number): string {
  return `${(Math.abs(n) * 100).toFixed(1)}%`;
}

function generateReason(
  components: ScoreComponents,
  events: MarketEvent[],
  since: Snapshot | null,
): string {
  if (!since) {
    if (events.length > 0) {
      return `${events.map((e) => e.headline).join("; ")}. First time tracking this symbol.`;
    }
    return "First time tracking this symbol — showing the latest quote.";
  }

  const clauses: string[] = [];

  if (events.length > 0) {
    clauses.push(events.map((e) => e.headline).join("; "));
  }

  const direction = components.percentChange >= 0 ? "Up" : "Down";
  const sigma = Math.abs(components.volatilityZScore);
  let moveClause = `${direction} ${formatPct(components.percentChange)} since you last checked`;
  if (sigma >= 1.2) {
    moveClause += ` — ${sigma.toFixed(1)}x its typical move for this period`;
  }
  if (components.volumeRatio >= 1.3) {
    moveClause += `, on ${components.volumeRatio.toFixed(1)}x average volume`;
  }
  clauses.push(moveClause);

  const reason = clauses.join(". ");
  return reason.endsWith(".") ? reason : `${reason}.`;
}

/**
 * Scores how much a symbol deserves the user's attention right now, given
 * their personal last-seen snapshot for it. This is the heart of the
 * product: the same market data produces different verdicts for different
 * users depending on when they personally last looked.
 */
export function scoreAttention(input: ScoreInput): AttentionResult {
  const components = computeComponents(input);
  const score = compositeScore(components);
  const tier = tierForScore(score);
  const reason = generateReason(components, input.events, input.since);

  return {
    symbol: input.quote.symbol,
    tier,
    score,
    reason,
    components,
    events: input.events,
    quote: input.quote,
    since: input.since,
  };
}
