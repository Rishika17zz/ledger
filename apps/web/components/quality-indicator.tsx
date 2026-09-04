import type { DataQuality } from "@ledger/core";

const QUALITY_META: Record<DataQuality["status"], { glyph: string; label: string; className: string }> = {
  live: { glyph: "●", label: "live", className: "text-text-tertiary" },
  stale: { glyph: "◐", label: "stale", className: "text-signal-attention" },
  disputed: { glyph: "◆", label: "disputed", className: "text-signal-attention" },
};

/**
 * Data quality is always visible, never hidden behind a "looks fine"
 * default -- live/stale/disputed use distinct glyph shapes (not just color)
 * so the difference survives color-blindness and low-contrast displays.
 */
export function QualityIndicator({ quality }: { quality: DataQuality }) {
  const meta = QUALITY_META[quality.status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-micro uppercase ${meta.className}`}
      title={quality.note ?? meta.label}
    >
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.label}
    </span>
  );
}
