import type { AttentionTier } from "../types/index.js";

/** Score thresholds that bucket a composite attention score into a UI tier. */
export const TIER_THRESHOLDS = {
  needsAttention: 2.5,
  notable: 1.0,
} as const;

export function tierForScore(score: number): AttentionTier {
  if (score >= TIER_THRESHOLDS.needsAttention) return "needs-attention";
  if (score >= TIER_THRESHOLDS.notable) return "notable";
  return "quiet";
}

export const TIER_ORDER: Record<AttentionTier, number> = {
  "needs-attention": 0,
  notable: 1,
  quiet: 2,
};
