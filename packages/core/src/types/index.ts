import { z } from "zod";

/**
 * Shared domain types for Ledger, expressed as zod schemas so the same
 * definitions validate data at runtime (API boundaries, WS payloads) and
 * provide static types everywhere else.
 */

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export const DataQualityStatus = z.enum(["live", "stale", "disputed"]);
export type DataQualityStatus = z.infer<typeof DataQualityStatus>;

/** One upstream source's view of a symbol's price at a point in time. */
export const SourceQuoteSchema = z.object({
  source: z.string(),
  price: z.number().positive(),
  timestamp: z.string().datetime(),
});
export type SourceQuote = z.infer<typeof SourceQuoteSchema>;

export const DataQualitySchema = z.object({
  status: DataQualityStatus,
  /** ISO timestamp of the quote actually being shown. */
  lastUpdated: z.string().datetime(),
  /** How stale the shown value is, in ms, relative to the expected update window. */
  staleForMs: z.number().nonnegative().optional(),
  /** Present only when status === "disputed": the disagreeing source readings. */
  disputedSources: z.array(SourceQuoteSchema).optional(),
  /** Human-readable one-liner explaining the current quality state. */
  note: z.string().optional(),
});
export type DataQuality = z.infer<typeof DataQualitySchema>;

export const QuoteSchema = z.object({
  symbol: z.string(),
  price: z.number().positive(),
  /** Reconciled, display-ready timestamp (ISO 8601). */
  timestamp: z.string().datetime(),
  /** Trailing daily volume (shares). */
  volume: z.number().nonnegative(),
  /** Trailing 20-period average volume, used for volume-confirmation scoring. */
  averageVolume: z.number().nonnegative(),
  /** Annualized trailing volatility (stddev of daily returns), used for z-scoring. */
  trailingVolatility: z.number().nonnegative(),
  quality: DataQualitySchema,
});
export type Quote = z.infer<typeof QuoteSchema>;

export const MarketEventType = z.enum([
  "earnings",
  "guidance-change",
  "analyst-upgrade",
  "analyst-downgrade",
  "halt",
  "52w-high",
  "52w-low",
]);
export type MarketEventType = z.infer<typeof MarketEventType>;

export const MarketEventSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  type: MarketEventType,
  timestamp: z.string().datetime(),
  headline: z.string(),
  /** Independent weight this event contributes to the attention score, 0-1. */
  weight: z.number().min(0).max(1),
});
export type MarketEvent = z.infer<typeof MarketEventSchema>;

// ---------------------------------------------------------------------------
// Change detection / attention scoring
// ---------------------------------------------------------------------------

export const AttentionTier = z.enum(["needs-attention", "notable", "quiet"]);
export type AttentionTier = z.infer<typeof AttentionTier>;

/** A user's last-seen snapshot for one symbol: the baseline change is measured against. */
export const SnapshotSchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  price: z.number().positive(),
  timestamp: z.string().datetime(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const ScoreComponentsSchema = z.object({
  /** Move since last-seen price, expressed as z-score against trailing volatility. */
  volatilityZScore: z.number(),
  /** Raw percentage move since last-seen price. */
  percentChange: z.number(),
  /** Current volume / average volume. */
  volumeRatio: z.number(),
  /** Hours elapsed since the user's last visit. */
  hoursSinceLastVisit: z.number(),
  /** Sum of weights of labeled events since last visit. */
  eventWeight: z.number(),
  /** Data quality contribution (disputed/stale downgrade confidence). */
  qualityPenalty: z.number(),
});
export type ScoreComponents = z.infer<typeof ScoreComponentsSchema>;

export const AttentionResultSchema = z.object({
  symbol: z.string(),
  tier: AttentionTier,
  score: z.number(),
  reason: z.string(),
  components: ScoreComponentsSchema,
  events: z.array(MarketEventSchema),
  quote: QuoteSchema,
  /** Null when the user has never seen this symbol before (first view). */
  since: SnapshotSchema.nullable(),
});
export type AttentionResult = z.infer<typeof AttentionResultSchema>;

// ---------------------------------------------------------------------------
// Watchlist / auth (shared shapes used across API <-> web)
// ---------------------------------------------------------------------------

export const WatchlistItemSchema = z.object({
  symbol: z.string(),
  addedAt: z.string().datetime(),
});
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;

export const UserPublicSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;
