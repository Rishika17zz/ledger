# Prompt for Claude Code

Copy everything below into Claude Code (as your first message, or as `CLAUDE.md` in an empty project folder plus the message "Build this").

---

## Project: Ledger — a smart market watchlist

Build a production-quality, full-stack "smart" stock watchlist. This is not
a plain price tracker — the core product problem is **attention triage**:
given a user's limited time, surface what actually changed and deserves a
look, not just raw numbers. Read the whole brief before writing code, then
propose a short implementation plan before starting.

### Functional requirements (minimum)

- Users can create an account/session, and add/remove/manage symbols in a watchlist.
- The UI shows latest market data for every tracked symbol.
- Returning to the app after time away surfaces **what changed since the
  last visit**, per-user, per-symbol — not just "what changed today."
- State persists across sessions and devices (a returning, authenticated
  user sees the same watchlist and history anywhere).

### The core algorithm: what counts as "meaningful"

Do not use a flat percentage threshold. Design a composite scoring model
that treats a price move as meaningful based on:

1. **Volatility-relative move** — score the move since the user's last
   visit as a z-score against that symbol's own trailing volatility (a 1%
   move on a low-volatility stock is more significant than the same move
   on a high-volatility one).
2. **Time-since-last-visit, computed per user** — this is the central UX
   idea. Two users looking at the same stock get different "what changed"
   verdicts depending on when they personally last checked. Store a
   per-user, per-symbol last-seen snapshot (price + timestamp) and diff
   against it, not against market open.
3. **Volume confirmation** — weight a price move higher when it's backed
   by abnormal volume vs. average.
4. **Labeled events** — earnings, guidance changes, analyst rating
   changes, 52-week high/low breaches — should be flagged with meaningful
   weight independent of price delta.
5. **Data-quality signals** (see below) treated as first-class — never
   hidden, always surfaced with their own indicator.

Every flagged symbol needs a **human-readable reason**, not just a score
("Down 2.1% since you last checked — 3x its typical daily move, on 4.6x
average volume"). Bucket results into clear tiers (e.g. needs-attention /
notable / quiet) and sort the UI by tier.

### Handling stale, delayed, and conflicting data

- Every quote must carry data-quality metadata: last-updated timestamp,
  a staleness flag if the feed hasn't updated within an expected window,
  and a conflict flag if two sources disagree.
- Define and implement an explicit reconciliation rule for conflicting
  data (e.g., most-recent-timestamp wins, but if two sources disagree
  above some threshold within a tight time window, mark the value
  `disputed` in the UI instead of silently picking one).
- Never let a stale value display as if it were live — the UI must
  visibly distinguish "live," "stale," and "disputed" states.

### Market data source

No paid/keyed market data API is available for this project. Build a
`MarketDataProvider` interface (`getQuote`, `subscribe`, etc.) with:
- A `SimulatedProvider` implementation as the default: realistic price
  simulation with volatility clustering (calm periods + occasional
  bursts), rare labeled event jumps (earnings/downgrades/halts), and
  **deliberately injected** staleness and conflicting-source scenarios on
  a randomized schedule, so the resilience logic above is continuously
  exercised, not just unit-tested in isolation.
- Design the interface so a real provider (Finnhub, Alpha Vantage,
  Twelve Data — pick one and stub it if time allows) could be swapped in
  without touching any other layer of the system.
- Document this decision clearly in the README as a deliberate choice,
  not a workaround.

### Architecture and stack

Use your judgment for the best-in-class professional choice, but here is
my strong preference — deviate only with a clearly stated reason:

- **Language**: TypeScript everywhere, strict mode on, no `any` without justification.
- **Frontend**: Next.js (App Router) + Tailwind CSS. Component-driven,
  with a real design system (tokens file, not ad hoc classes scattered
  everywhere).
- **Backend**: Node.js — either Next.js API routes/route handlers if that
  keeps the architecture clean, or a separate Fastify/Express service if
  you judge the domain logic (simulation engine, scoring engine,
  reconciliation) deserves to be decoupled from the web layer. Justify
  whichever you pick.
- **Database**: PostgreSQL via Prisma (or Drizzle) for durable state
  (users, watchlists, last-seen snapshots). SQLite is acceptable as a
  zero-config local/dev fallback behind the same schema, but Postgres
  should be the intended production target — show the migration files.
- **Caching / hot path**: Redis (or an in-memory abstraction behind a
  matching interface, clearly labeled as a Redis stand-in) for the latest
  quote per symbol and computed attention scores, since these are read
  far more than they're written.
- **Real-time delivery**: WebSockets or SSE — push updates to connected
  clients rather than polling.
- **Auth**: a real, simple auth flow (email magic link, or a lightweight
  credential+session system) — not a hand-wavy token. This is what
  enables genuine cross-device persistence.
- **Testing**: Vitest or Jest for unit tests on the scoring engine and
  reconciliation logic specifically (these are the parts with real logic
  worth testing) plus a handful of integration tests on the API layer.
- **Tooling**: ESLint + Prettier configured and passing, a `package.json`
  with clean scripts (`dev`, `build`, `test`, `lint`, `typecheck`), and a
  `Dockerfile` + `docker-compose.yml` (app + Postgres + Redis) so the
  whole thing runs with one command for anyone reviewing it.
- **CI**: a GitHub Actions workflow that runs lint, typecheck, and tests
  on push.

### Professional project structure

Use a clean monorepo layout (npm/pnpm workspaces) — do not dump
everything into one flat folder. Something like:

```
ledger/
├── apps/
│   ├── web/                  # Next.js frontend
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── styles/
│   └── api/                  # backend service (if separated from web)
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   └── ws/
│       └── test/
├── packages/
│   ├── core/                 # the interesting domain logic — provider-agnostic
│   │   ├── market-data/      # MarketDataProvider interface + SimulatedProvider
│   │   ├── change-detection/ # scoring engine + reconciliation
│   │   └── types/            # shared TypeScript types/schemas (zod)
│   ├── database/             # Prisma schema, migrations, seed script
│   └── config/                # shared eslint/tsconfig/tailwind config
├── docker-compose.yml
├── .github/workflows/ci.yml
├── README.md
└── package.json
```

Adjust as you see fit, but keep the principle: domain logic (`packages/core`)
must not import from the web or API layer, and must be independently
testable.

### README requirements

Write a README that reads like a design memo, not boilerplate. It must
cover, explicitly:
- What counts as a "meaningful change" and why (the scoring model).
- How stale/delayed/conflicting data is detected and reconciled.
- Why a simulated provider was used, and how a real one would swap in.
- How state persists across sessions and devices.
- The scaling story: specifically, that ingestion cost should scale with
  unique symbols tracked across all users, not with user count — explain
  how the architecture achieves that (one upstream subscription per
  symbol, fanned out to all subscribed clients).
- What was deliberately kept simple, and what the production upgrade path
  looks like for each of those simplifications.

---

## UI / design direction — read this carefully, this matters as much as the backend

Do **not** produce a generic SaaS dashboard. Avoid, specifically:
- Cream/off-white background with a warm terracotta accent (an overused
  AI-generated-design default).
- Identical rounded cards with soft drop shadows and gradient washes.
- Tracked-out ALL-CAPS eyebrow labels above every heading.
- Generic blue/purple gradient "fintech app" look.
- A single accent color doing everything (buy, sell, warning, and brand,
  all the same hue).

Instead, design **a market terminal reimagined for a single person's
attention**, not an institutional Bloomberg clone and not a consumer
"stocks are fun" app. Ground the design in what the product actually is:
a serious, dense, glanceable instrument for triage — closer to a
well-designed developer tool or a flight-ops dashboard than a typical
consumer fintech app.

Specific direction (adapt and improve on this, don't follow it blindly —
make it your own, but keep the spirit):

- **Palette**: a dark, near-navy ink background (not pure black) with a
  restrained, *functionally meaningful* color system: one color means
  "up/positive," a distinct one means "down/negative," a third
  (amber/gold, not red) means "needs your attention" as a state
  independent of direction, and a muted slate tone for "quiet, no action
  needed." Every color in the UI should mean something specific and be
  used consistently — no decorative color.
- **Typography**: pair a strong, confident sans-serif for UI chrome and
  headlines with a monospaced typeface used specifically and only for
  tabular numeric data (prices, percentages, volumes) — this is
  functionally justified (numeric alignment) rather than a decorative
  "tech" cliché. Establish a real type scale, not ad hoc Tailwind sizes.
- **Layout**: the watchlist itself should read like a dense, scannable
  ledger/blotter — hairline row dividers, right-aligned numeric columns,
  no unnecessary card chrome around each row. Reserve rounded corners and
  card treatment for secondary UI (search, modals, badges), not the
  primary data table.
- **Hierarchy through structure, not decoration**: use a left accent bar
  or similar structural device to indicate a row's attention tier, rather
  than colored badges alone. Sort by attention tier by default.
- **Motion**: one deliberate, orchestrated moment (e.g., a brief
  highlight-flash on a row when live data updates it) rather than hover
  animations scattered across every element. Motion should communicate
  "this just changed," not decorate.
- **Empty and error states**: written in the interface's own voice —
  specific and instructional ("Your watchlist is empty — add a symbol to
  start tracking it"), never apologetic filler text.
- **Microcopy**: plain, active-voice, specific. A reason string should
  read like a knowledgeable colleague's one-line explanation, not a
  system log line.
- **Responsiveness**: fully usable down to mobile width — decide
  deliberately what collapses or hides on small screens (e.g., the
  reason column may need to become an expandable row rather than
  disappearing).
- **Accessibility**: visible keyboard focus states throughout, sufficient
  color contrast (verify the palette against WCAG AA, especially the
  amber/green/red-on-navy combinations), respect
  `prefers-reduced-motion`.

Before writing any component code, write out your actual design plan
first (palette as named hex values, type choices and scale, a short ASCII
wireframe of the main watchlist view, and 3–4 sentences on what makes
this specific and not a template) and briefly check it against the
"avoid" list above. Only then start building.

---

## Process

1. Propose a short implementation plan and confirm the architecture
   choices above before writing code, especially the frontend/backend
   split and database choice.
2. Build the domain logic first (`packages/core`) — the simulator and the
   change-detection/reconciliation engine — and write tests for it before
   wiring up the UI. This is the part of the system with real logic; get
   it right in isolation.
3. Then build the API layer, then the frontend, then wire real-time
   delivery end to end.
4. Get the whole thing running via `docker-compose up` (or documented
   equivalent) and verify it actually works before calling it done —
   don't just generate files and assume correctness.
5. Write the README last, once the actual decisions are final.

Ask me clarifying questions only if something above is genuinely
ambiguous and blocks a real architectural decision — otherwise use your
best professional judgment and note the assumption in the README.
