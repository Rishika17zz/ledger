# Ledger

Ledger is a market watchlist built around one idea: the hard problem isn't
showing prices, it's **attention triage**. Given a user with limited time,
what actually deserves a look right now — and what's just noise? Everything
in this repo is organized around answering that question well, per user,
per symbol, every time someone comes back.

This document is a design memo, not boilerplate. It explains what the
system does and why, in the order you'd want to interrogate it.

---

## 1. What counts as a "meaningful change," and why

A flat percentage threshold ("flag anything that moved >2%") is wrong for
two reasons: it treats a sleepy consumer-staples stock the same as a
biotech that swings 5% on a slow day, and it compares against market open
instead of against *when this specific person last looked*. Ledger's
scoring engine (`packages/core/src/change-detection/scoring.ts`) fixes
both.

For every `(user, symbol)` pair, on every visit, it computes:

1. **Volatility-relative move (z-score).** The symbol's trailing
   annualized volatility is scaled down to the actual elapsed time since
   the user's last visit (`σ × √(hoursSinceLastVisit / hoursPerYear)`),
   then the raw percent move is divided by that period-scaled volatility.
   This single calculation is what makes the "same move, different verdict
   per user" idea real: a 3% move in the hour since you checked is many
   standard deviations of surprise; the same 3% move over the month since
   your last visit is unremarkable random walk. The elapsed time is
   floored at 5 minutes so a genuine two-second tick doesn't produce an
   absurd z-score from noise.
2. **Volume confirmation.** `volume / averageVolume` scales a multiplier
   on the move score (capped at +60% around 5x average volume), so a price
   move backed by unusual volume scores higher than the same move on
   ordinary volume.
3. **Labeled events**, weighted independently of price (earnings,
   guidance changes, analyst rating changes, 52-week high/low breaches).
   A quiet price chart with an earnings miss still gets flagged — event
   weight is added on top of, not gated behind, the price-move score.
4. **Data-quality penalty.** Stale or disputed data adds its own score
   contribution (see §2) so a symbol you can't currently trust the number
   for surfaces on its own merits, never silently.

These combine into one composite score
(`moveScore·volumeMultiplier + eventWeight·3 + qualityPenalty`), which
buckets into three tiers — `needs-attention` (≥2.5), `notable` (≥1.0),
`quiet` (below) — via `tierForScore()`. The UI sorts and groups by tier.

Every result also carries a **generated, human-readable reason**
(`generateReason()`), e.g. *"Down 2.1% since you last checked — 3.4x its
typical move for this period, on 4.6x average volume."* Events are
prepended in plain language ("Upgraded by a major analyst") rather than
surfaced as a raw event code. The goal is a sentence a knowledgeable
colleague would actually say, not a log line.

**First-ever view of a symbol** has no snapshot to diff against, so it's
scored `quiet` with "First time tracking this symbol" — unless a labeled
event fired independently, in which case the event alone can still surface
it. This is a deliberate default, not a gap: there's nothing to compare
against yet.

This whole engine lives in `packages/core` with zero dependency on the web
or API layer, and is unit-tested in isolation (`packages/core/test/scoring.test.ts`)
— including a test that asserts two users with different last-seen
timestamps get different verdicts for the identical market move, which is
the actual product thesis.

## 2. Stale, delayed, and conflicting data

Every quote is reconciled from **two independent simulated source feeds**
(`primary-feed`, `secondary-feed`) through
`packages/core/src/change-detection/reconciliation.ts`, on every tick —
not just in a unit test. The rule, in order:

1. **Staleness first.** If the most recent reading across all sources is
   older than `staleAfterMs` (default 90s) relative to now, the quote is
   flagged `stale` regardless of whether the sources agree. A value is
   never shown as live just because it used to be right.
2. **Most-recent-timestamp wins** for *which* value is displayed.
3. **Dispute detection.** Among readings that landed within a tight
   window of each other (`disputeWindowMs`, default 5s), if the spread
   between them exceeds `disputeThresholdPct` (default 0.5%), the quote is
   flagged `disputed` instead of silently trusting the newest one. The
   disputed value is still shown (most-recent-wins), but the UI is told
   explicitly that it's contested and why (`quality.note`,
   `quality.disputedSources`).

The UI (`QualityIndicator` component) always renders the quality state —
**live**, **stale**, or **disputed** — as a persistent glyph + label next
to every row, using shape (●/◐/◆) as well as color so the distinction
survives color-blindness. It is never hidden behind a "looks fine"
default, and staleness/disputes contribute their own weight to the
attention score (§1.4), so a data-quality problem can surface a symbol on
its own even with zero price movement.

`SimulatedProvider` deliberately injects both scenarios on a randomized
schedule (`staleInjectionProbability`, `disputeInjectionProbability`) —
freezing a symbol's feed for 30–180s, or widening the secondary source's
noise for a few seconds — so this logic runs continuously against live
traffic while the app is running, not just in `reconciliation.test.ts`.

## 3. Why a simulated market data provider

No paid/keyed market data API was available for this project. Rather than
treat that as a limitation to work around, `packages/core/src/market-data/provider.ts`
defines a narrow `MarketDataProvider` interface —
`listSymbols` / `getQuote` / `getQuotes` / `getRecentEvents` / `subscribe`
/ `onEvent` — and `SimulatedProvider` is one implementation of it. Nothing
outside `packages/core` and the composition root in `apps/api/src/index.ts`
knows or cares that it's simulated.

`SimulatedProvider` isn't a random walk. It models:

- **Volatility clustering** — each symbol has a calm/burst regime that
  flips with small per-tick probability, and trailing volatility eases
  toward the regime's target rather than snapping, so calm periods and
  volatile bursts look like real markets, not noise.
- **Rare labeled events** (earnings, guidance changes, analyst
  upgrades/downgrades, halts, 52-week breaches) with real price impact and
  independent scoring weight.
- **Injected staleness and source conflicts** on a randomized schedule
  (§2), so the resilience logic is continuously exercised.

**Swapping in a real provider** (Finnhub, Alpha Vantage, Twelve Data) means
writing one class that implements `MarketDataProvider` and changing the
single line in `apps/api/src/index.ts` that constructs it
(`new SimulatedProvider()` → `new FinnhubProvider(apiKey)`). Nothing in
the scoring engine, reconciliation, database, API routes, WebSocket
gateway, or frontend would need to change — the interface boundary is the
whole point. A real implementation would likely still want to run the
reconciliation step across the provider's own primary/backup feeds, or
against a second provider, to get genuine multi-source conflict detection
rather than simulating it.

## 4. State persistence across sessions and devices

Everything that defines "this user's experience" is server-side, keyed by
`userId`, in Postgres (`packages/database/prisma/schema.prisma`):

- **`User`** — email + bcrypt password hash.
- **`Session`** — server-side session record behind an httpOnly cookie
  (see §7 on auth).
- **`WatchlistItem`** — `(userId, symbol)`, unique per pair. This is the
  watchlist itself.
- **`Snapshot`** — `(userId, symbol, price, timestamp)`, unique per pair.
  This is the "what did I last see" baseline described in §1.

Because a returning, authenticated user's watchlist and snapshots live in
the database rather than in a browser cookie or local storage, logging in
from a different device shows the identical watchlist and identical
"what's changed since you last looked" verdicts — the snapshot was written
by the *user*, not the *browser*.

**Visit semantics.** `GET /api/watchlist/attention` is the one endpoint
that both reads and *advances* the snapshot: it scores every watchlist
symbol against the currently-stored snapshot, then checkpoints the
snapshot to the current quote. That call is what "a visit" means in this
product. Live WebSocket ticks *while a tab is open*, by contrast, only
call `AttentionService.computeForSymbol` (score against the current
snapshot) — they never move the baseline. So a score can keep updating in
real time within a session against a fixed "since you opened this"
baseline, and the baseline only advances forward on the next real visit
(reload, reconnect, next day). See `apps/api/src/market/attention-service.ts`
for both code paths side by side.

## 5. Scaling story: ingestion cost tracks unique symbols, not users

`apps/api/src/market/engine.ts` (`MarketEngine`) is the one place that
talks to the `MarketDataProvider`. It ref-counts subscriptions by symbol:

- Adding a symbol to *any* user's watchlist calls `ensureSubscribed(symbol)`,
  which opens exactly one upstream `provider.subscribe([symbol], ...)` the
  first time any watchlist references that symbol (ref count 0→1), and
  increments a counter on every subsequent add.
- Removing a symbol calls `release(symbol)`, decrementing the counter and
  only tearing down the upstream subscription when it hits zero.
- At boot, the API bulk-subscribes once to every symbol that appears in
  *any* row of `WatchlistItem` across all users (`prisma.watchlistItem.findMany({ distinct: ["symbol"] })`).

Every quote tick for a subscribed symbol is written once to the cache
(§6) and fanned out through an in-process `EventEmitter` channel per
symbol. The WebSocket gateway (`apps/api/src/ws/gateway.ts`) never opens a
new provider subscription per connection — it only attaches a listener to
a channel the engine already owns. So whether ARDX is watched by one
person or ten thousand concurrent connections, the simulated (or real)
provider sees exactly **one** subscription for ARDX. Ingestion cost scales
with the size of the distinct symbol universe actually being tracked, not
with user or connection count — which is the property that makes this
architecture viable against a real, rate-limited market data API.

## 6. Caching

`apps/api/src/cache/` defines a `CacheProvider` interface
(`get`/`set`/`del`) with two implementations: `RedisCache` (via `ioredis`,
used whenever `REDIS_URL` is set) and `InMemoryCache` (a same-interface,
in-process stand-in used otherwise — this is what CI and local dev without
Redis run against). Nothing above the interface knows which one is live.

The engine caches the latest quote per symbol (`quote:{symbol}`, 30s TTL)
on every tick, since quotes are read far more often than the provider
ticks. Reads through `MarketEngine.getQuote()` hit cache first and fall
back to the provider only on a cold key.

## 7. Auth

Email + password with bcrypt (10 rounds) and a server-side `Session` row
behind an httpOnly, `SameSite=Lax` cookie
(`apps/api/src/auth/`). Magic-link auth was the other option on the table,
but it requires real outbound email delivery, which is infrastructure this
project deliberately doesn't have — a "magic link" with nowhere to deliver
it would just be a fake token in different clothing. Credential + session
is genuinely real (verifiable hashes, server-side session expiry, proper
cookie flags) without pretending to solve a problem (email delivery) that's
out of scope.

## 8. Architecture

```
ledger/
├── apps/
│   ├── web/        Next.js 14 App Router + Tailwind — the UI
│   └── api/         Fastify service — auth, watchlist CRUD, scoring, WebSocket fanout
├── packages/
│   ├── core/        Provider-agnostic domain logic (market-data, change-detection, types)
│   ├── database/    Prisma schema, migrations, seed
│   └── config/      Shared tsconfig + eslint base config
├── docker-compose.yml
└── .github/workflows/ci.yml
```

**Why a separate API service instead of Next.js route handlers:** the
simulation engine needs a long-lived in-memory process (the tick loop, the
per-symbol `EventEmitter` fanout, ref-counted provider subscriptions) and
a WebSocket server — none of which fit cleanly into Next's
request-per-invocation route handler model. Fastify is a small, fast,
well-typed choice for that; Express would work too but Fastify's native
async/await and schema-friendly ecosystem (`@fastify/websocket`,
`@fastify/cookie`) fit better here. `packages/core` has zero dependency on
either the web or API layer — it's imported by both, and is independently
unit-tested.

**Why Postgres via Prisma, with a documented SQLite swap:** Postgres is
the intended production target — see `docker-compose.yml` and the
generated migration in `packages/database/prisma/migrations/`. The schema
deliberately avoids Postgres-only column features (no native enums,
arrays, or JSONB operators — enums are plain strings, e.g.
`DataQualityStatus`), so switching `packages/database/prisma/schema.prisma`'s
`datasource.provider` from `postgresql` to `sqlite` (and pointing
`DATABASE_URL` at a `file:` path) is genuinely a two-line change for a
zero-config local run, which is how this project was actually smoke-tested
end to end in a sandbox without Docker or a local Postgres/Redis install
available (see §10).

**Why WebSockets over polling:** the whole point of the product is showing
what changed since last visit *and* keeping that live while the tab is
open, without re-polling on a timer. One connection per tab, server-pushed
ticks, ref-counted at the source (§5).

## 9. UI design

Ledger is designed as a dense, single-person triage instrument — closer to
a well-made developer tool or ops dashboard than a consumer trading app,
and closer to a terminal reimagined for one person than an institutional
Bloomberg clone.

**Palette** (all named, all functional — no decorative color):

| Token | Hex | Meaning |
|---|---|---|
| `ink-950` | `#090C11` | Page background (near-navy, not pure black) |
| `ink-900` | `#0E121A` | Panel/section background |
| `ink-800` | `#141924` | Elevated surface (modals) |
| `ink-700` | `#1C2330` | Hairline borders |
| `text-primary` | `#E7EAF1` | Primary text |
| `text-secondary` | `#97A1B5` | Secondary text, reasons |
| `text-tertiary` | `#616B7E` | Metadata, timestamps |
| `signal-gain` | `#34D0A0` | Price up — nothing else |
| `signal-loss` | `#F2596B` | Price down — nothing else |
| `signal-attention` | `#E8A93B` | Needs-attention tier *and* stale/disputed data — both mean "look at this," deliberately sharing one hue |
| `signal-quiet` | `#56607A` | Quiet tier baseline |
| `accent-focus` | `#5AC8FA` | Keyboard focus rings, links, and the "notable" tier accent bar — one consistent "worth a glance" meaning, never reused for gain/loss/alert |

Defined once as Tailwind theme tokens in `apps/web/tailwind.config.ts` —
that file *is* the design system, not a place to reach past with ad hoc
utility classes.

**Type**: Manrope for UI chrome and headlines (confident, geometric, not
the default Inter-everywhere look), JetBrains Mono *only* for numeric data
— prices, percentages, volume — via `next/font/google`. The monospace
choice is functional (tabular column alignment), not decorative. Scale:
`display` 2.5rem / `h1` 1.75rem / `h2` 1.25rem / `body` 0.9375rem /
`small` 0.8125rem / `micro` 0.6875rem, plus two tabular-specific sizes for
the numeric columns.

**Layout**: the watchlist (`LedgerTable` / `LedgerRow`) is a hairline-divided
blotter, not a stack of cards — no shadow or gradient chrome on rows,
right-aligned monospace numeric columns, a left accent bar (not a badge)
signaling tier: amber for needs-attention, blue for notable, none for
quiet. Rounded-corner card treatment is reserved for secondary UI — the
add-symbol modal, the empty state — per the brief. Rows group under plain
(non-tracked-out, non-uppercase-eyebrow) section labels: "Needs attention",
"Notable", "Quiet".

**Data quality** gets its own glyph-based indicator (§2) rather than being
folded into the gain/loss/attention palette, so "can I trust this number"
stays visually distinct from "did the price move."

**Motion**: exactly one deliberate animation — a brief background flash
(`animate-flash-update`, defined as a keyframe in the Tailwind config) on
a row when a live WebSocket tick actually changes its quote timestamp.
No hover animations scattered around the UI. `prefers-reduced-motion` is
respected globally in `app/globals.css`.

**Responsive**: the reason text collapses into an expandable row
(click-to-toggle chevron) rather than disappearing on narrow screens — the
same `LedgerRow` component handles both breakpoints, just showing more
columns (volume, quality glyph) as space allows via `sm:`/`md:`/`lg:`
breakpoints.

**Accessibility**: a visible focus ring (`:focus-visible`, using
`accent-focus`) on every interactive element, data-quality states encoded
in shape as well as color, and the reduced-motion media query above.

## 10. What was kept simple, and the production upgrade path

| Simplification | Why | Production upgrade path |
|---|---|---|
| Simulated market data | No API key available for this project (§3) | Implement `MarketDataProvider` against Finnhub/Alpha Vantage/Twelve Data; swap one constructor call |
| In-memory `CacheProvider` fallback | Zero-config local dev / CI without a Redis install | Already implemented — set `REDIS_URL` and `RedisCache` takes over with no code changes elsewhere |
| SQLite-swappable schema, single migration history | No Postgres available in the sandbox this was verified in; kept the schema portable rather than Postgres-only from day one | Run `prisma migrate deploy` against a real Postgres in CI/CD (the committed migration is already Postgres SQL); the SQLite swap stays available for contributors without Docker |
| Single Fastify process holding all `MarketEngine` state in memory | Simplicity for a single-instance deployment | Move the per-symbol fanout to Redis pub/sub (already have Redis in the stack) so multiple API instances share one upstream subscription per symbol instead of one per instance |
| Credential + session auth, no email delivery | No mail provider configured for this project (§7) | Add a transactional email provider and layer magic-link/passwordless on top of the existing session model |
| No rate limiting / CSRF token | Out of scope for a take-home-sized project | Add `@fastify/rate-limit` and a CSRF double-submit token for state-changing routes before any public deployment |
| 15-symbol simulated universe | Enough to exercise every tier, event type, and data-quality scenario without a large static fixture | Trivial to extend `packages/core/src/market-data/symbols.ts`, or replace entirely once a real provider is wired in |

## Running it

### Docker (recommended — app + Postgres + Redis in one command)

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000
- On first boot, run migrations + seed once:
  ```bash
  docker compose exec api pnpm --filter @ledger/database migrate:deploy
  docker compose exec api pnpm --filter @ledger/database seed
  ```
  (or add these as a one-off `docker compose run` before `up` in CI/CD).

A seeded demo account is created by the seed script: **demo@ledger.dev /
demo1234**, pre-populated with a 5-symbol watchlist.

### Local development without Docker

Requires Node 20+, pnpm, and either a local Postgres or the SQLite swap
described in §8.

```bash
pnpm install
cp packages/database/.env.example packages/database/.env   # edit DATABASE_URL
pnpm db:migrate
pnpm db:seed
pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:3000
```

### Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four run in CI on every push/PR (`.github/workflows/ci.yml`).
