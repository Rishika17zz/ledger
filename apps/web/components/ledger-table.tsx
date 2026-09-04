import type { AttentionResult, AttentionTier, SymbolMeta } from "@ledger/core";
import { EmptyState } from "./empty-state";
import { LedgerRow } from "./ledger-row";

const SECTION_LABEL: Record<AttentionTier, string> = {
  "needs-attention": "Needs attention",
  notable: "Notable",
  quiet: "Quiet",
};

const SECTION_ORDER: AttentionTier[] = ["needs-attention", "notable", "quiet"];

export function LedgerTable({
  results,
  symbolMeta,
  onRemove,
  onAddClick,
}: {
  results: AttentionResult[];
  symbolMeta: Map<string, SymbolMeta>;
  onRemove: (symbol: string) => void;
  onAddClick: () => void;
}) {
  if (results.length === 0) {
    return <EmptyState onAddClick={onAddClick} />;
  }

  const grouped = new Map<AttentionTier, AttentionResult[]>();
  for (const result of results) {
    const list = grouped.get(result.tier) ?? [];
    list.push(result);
    grouped.set(result.tier, list);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink-700">
      {SECTION_ORDER.map((tier) => {
        const items = grouped.get(tier);
        if (!items || items.length === 0) return null;
        return (
          <div key={tier}>
            <div className="border-b border-ink-700 bg-ink-900/60 px-4 py-1.5 text-micro text-text-tertiary">
              {SECTION_LABEL[tier]} · {items.length}
            </div>
            {items.map((result) => (
              <LedgerRow
                key={result.symbol}
                result={result}
                name={symbolMeta.get(result.symbol)?.name ?? result.symbol}
                onRemove={onRemove}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
