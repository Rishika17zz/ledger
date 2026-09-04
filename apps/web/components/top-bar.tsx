export function TopBar({
  email,
  onAddClick,
  onLogout,
  liveCount,
  issueCount,
}: {
  email: string;
  onAddClick: () => void;
  onLogout: () => void;
  liveCount: number;
  issueCount: number;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-ink-700 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="text-h1">Ledger</span>
        <span className="hidden text-small text-text-tertiary sm:inline">· {email}</span>
      </div>

      <div className="flex items-center gap-3 text-micro text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-gain" aria-hidden="true" />
          {liveCount} live
        </span>
        {issueCount > 0 && (
          <span className="inline-flex items-center gap-1 text-signal-attention">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-attention" aria-hidden="true" />
            {issueCount} flagged
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onAddClick}
          className="rounded-md bg-accent-focus px-3 py-1.5 text-small font-semibold text-ink-950 hover:opacity-90"
        >
          + Add symbol
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-md border border-ink-600 px-3 py-1.5 text-small text-text-secondary hover:border-ink-600 hover:bg-ink-900"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
