export function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink-700 px-6 py-16 text-center">
      <p className="text-h2">Your watchlist is empty</p>
      <p className="max-w-sm text-small text-text-secondary">
        Add a symbol to start tracking it. Ledger will remember what you last saw and tell you
        exactly what changed the next time you look.
      </p>
      <button
        type="button"
        onClick={onAddClick}
        className="mt-2 rounded-md bg-accent-focus px-4 py-2 text-small font-semibold text-ink-950 hover:opacity-90"
      >
        Add a symbol
      </button>
    </div>
  );
}
