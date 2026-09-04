"use client";

import { useEffect, useRef, useState } from "react";
import type { AttentionResult } from "@ledger/core";
import { formatPercent, formatPrice, formatRelativeTime, formatVolume } from "@/lib/format";
import { QualityIndicator } from "./quality-indicator";

const TIER_ACCENT: Record<AttentionResult["tier"], string> = {
  "needs-attention": "border-l-signal-attention",
  notable: "border-l-accent-focus",
  quiet: "border-l-transparent",
};

export function LedgerRow({
  result,
  name,
  onRemove,
}: {
  result: AttentionResult;
  name: string;
  onRemove: (symbol: string) => void;
}) {
  const [expanded, setExpanded] = useState(result.tier !== "quiet");
  const [flash, setFlash] = useState(false);
  const isFirstRender = useRef(true);
  const lastTimestamp = useRef(result.quote.timestamp);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (result.quote.timestamp !== lastTimestamp.current) {
      lastTimestamp.current = result.quote.timestamp;
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(timer);
    }
  }, [result.quote.timestamp]);

  const isUp = result.components.percentChange >= 0;
  const directionColor = isUp ? "text-signal-gain" : "text-signal-loss";
  const arrow = isUp ? "▲" : "▼";

  return (
    <div
      className={`border-l-4 border-b border-b-ink-700 ${TIER_ACCENT[result.tier]} ${
        flash ? "animate-flash-update" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-900/60 focus-visible:bg-ink-900/60"
        aria-expanded={expanded}
      >
        <div className="w-20 shrink-0">
          <div className="text-body font-semibold">{result.symbol}</div>
          <div className="hidden truncate text-micro text-text-tertiary sm:block">{name}</div>
        </div>

        <div className="min-w-0 flex-1 truncate text-small text-text-secondary sm:hidden">
          {result.since ? result.reason : "First time tracking"}
        </div>
        <div className="hidden min-w-0 flex-1 truncate text-small text-text-secondary sm:block">
          {expanded ? "" : result.reason}
        </div>

        <div className="tabular ml-auto shrink-0 text-right text-tabular-base">{formatPrice(result.quote.price)}</div>
        <div className={`tabular w-24 shrink-0 text-right text-tabular-base ${directionColor}`}>
          {arrow} {formatPercent(result.components.percentChange)}
        </div>
        <div className="tabular hidden w-16 shrink-0 text-right text-small text-text-secondary md:block">
          {formatVolume(result.quote.volume)}
        </div>
        <div className="hidden w-20 shrink-0 text-right lg:block">
          <QualityIndicator quality={result.quote.quality} />
        </div>
        <svg
          className={`h-3 w-3 shrink-0 text-text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-ink-700/60 bg-ink-900/40 px-4 py-3 pl-[4.75rem]">
          <p className="text-small text-text-secondary">{result.reason}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-text-tertiary">
            <span>Updated {formatRelativeTime(result.quote.timestamp)}</span>
            <span className="lg:hidden">
              <QualityIndicator quality={result.quote.quality} />
            </span>
            <span>Vol {formatVolume(result.quote.volume)}</span>
            {result.since && <span>Since {formatRelativeTime(result.since.timestamp)}</span>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(result.symbol);
              }}
              className="ml-auto text-micro text-text-tertiary underline decoration-dotted hover:text-signal-loss"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
