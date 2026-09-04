"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttentionResult, SymbolMeta } from "@ledger/core";
import { AddSymbolModal } from "@/components/add-symbol-modal";
import { LedgerTable } from "@/components/ledger-table";
import { TopBar } from "@/components/top-bar";
import { api, type UserDto, type WatchlistItemDto } from "@/lib/api-client";
import { useAttentionStream } from "@/lib/use-attention-stream";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItemDto[]>([]);
  const [results, setResults] = useState<Map<string, AttentionResult>>(new Map());
  const [allSymbols, setAllSymbols] = useState<SymbolMeta[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const me = await api.me();
        if (cancelled) return;
        setUser(me);
        const [symbols, items, attention] = await Promise.all([
          api.symbols(),
          api.watchlist(),
          api.attention(),
        ]);
        if (cancelled) return;
        setAllSymbols(symbols);
        setWatchlist(items);
        setResults(new Map(attention.map((r) => [r.symbol, r])));
      } catch {
        if (!cancelled) router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const trackedSymbols = useMemo(() => watchlist.map((w) => w.symbol), [watchlist]);
  const symbolMeta = useMemo(() => new Map(allSymbols.map((s) => [s.symbol, s])), [allSymbols]);

  const handleStreamUpdate = useCallback((result: AttentionResult) => {
    setResults((prev) => {
      const next = new Map(prev);
      next.set(result.symbol, result);
      return next;
    });
  }, []);

  useAttentionStream(trackedSymbols, handleStreamUpdate);

  async function handleAdd(symbol: string) {
    setError(null);
    try {
      const item = await api.addSymbol(symbol);
      setWatchlist((prev) => [...prev, item]);
      setShowAddModal(false);
      const fresh = await api.attention();
      setResults(new Map(fresh.map((r) => [r.symbol, r])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that symbol.");
    }
  }

  async function handleRemove(symbol: string) {
    await api.removeSymbol(symbol);
    setWatchlist((prev) => prev.filter((w) => w.symbol !== symbol));
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(symbol);
      return next;
    });
  }

  async function handleLogout() {
    await api.logout();
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-text-secondary">
        Loading your watchlist…
      </main>
    );
  }

  const resultList = trackedSymbols.map((s) => results.get(s)).filter((r): r is AttentionResult => Boolean(r));
  const liveCount = resultList.filter((r) => r.quote.quality.status === "live").length;
  const issueCount = resultList.filter((r) => r.quote.quality.status !== "live").length;

  return (
    <main className="min-h-screen">
      <TopBar
        email={user.email}
        onAddClick={() => setShowAddModal(true)}
        onLogout={handleLogout}
        liveCount={liveCount}
        issueCount={issueCount}
      />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {error && <p className="mb-3 text-small text-signal-loss">{error}</p>}
        <LedgerTable
          results={resultList}
          symbolMeta={symbolMeta}
          onRemove={handleRemove}
          onAddClick={() => setShowAddModal(true)}
        />
      </div>

      {showAddModal && (
        <AddSymbolModal
          allSymbols={allSymbols}
          trackedSymbols={new Set(trackedSymbols)}
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </main>
  );
}
