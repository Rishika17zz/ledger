"use client";

import { useMemo, useState } from "react";
import type { SymbolMeta } from "@ledger/core";

export function AddSymbolModal({
  allSymbols,
  trackedSymbols,
  onAdd,
  onClose,
}: {
  allSymbols: SymbolMeta[];
  trackedSymbols: Set<string>;
  onAdd: (symbol: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allSymbols
      .filter((s) => !trackedSymbols.has(s.symbol))
      .filter((s) => !q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allSymbols, trackedSymbols, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/70 px-4 pt-24 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-800 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add a symbol"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol or company name…"
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-body text-text-primary placeholder:text-text-tertiary focus-visible:border-accent-focus"
        />
        <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          {results.length === 0 && (
            <p className="px-2 py-6 text-center text-small text-text-tertiary">
              {query ? "No matching symbols." : "Every tracked symbol is already on your watchlist."}
            </p>
          )}
          {results.map((s) => (
            <button
              key={s.symbol}
              type="button"
              onClick={() => onAdd(s.symbol)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-ink-900 focus-visible:bg-ink-900"
            >
              <span>
                <span className="font-semibold">{s.symbol}</span>
                <span className="ml-2 text-small text-text-secondary">{s.name}</span>
              </span>
              <span className="text-micro text-text-tertiary">{s.sector}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
