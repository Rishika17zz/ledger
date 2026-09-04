/**
 * A minimal in-memory stand-in for the Prisma client, implementing only the
 * calls the API layer actually makes. This lets the integration tests below
 * exercise real route/auth/scoring logic without a live Postgres instance,
 * matching the calls made in src/auth/auth.service.ts, src/routes/*.ts, and
 * src/market/attention-service.ts.
 */
let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}
interface FakeSession {
  id: string;
  userId: string;
  expiresAt: Date;
}
interface FakeWatchlistItem {
  id: string;
  userId: string;
  symbol: string;
  addedAt: Date;
}
interface FakeSnapshot {
  id: string;
  userId: string;
  symbol: string;
  price: number;
  timestamp: Date;
}

export function createFakePrisma() {
  const users: FakeUser[] = [];
  const sessions: FakeSession[] = [];
  const watchlistItems: FakeWatchlistItem[] = [];
  const snapshots: FakeSnapshot[] = [];

  return {
    user: {
      async findUnique({ where }: { where: { email?: string; id?: string } }) {
        return users.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null;
      },
      async create({ data }: { data: { email: string; passwordHash: string } }) {
        const user: FakeUser = { id: nextId("user"), createdAt: new Date(), ...data };
        users.push(user);
        return user;
      },
    },
    session: {
      async create({ data }: { data: { userId: string; expiresAt: Date } }) {
        const session: FakeSession = { id: nextId("sess"), ...data };
        sessions.push(session);
        return session;
      },
      async findUnique({ where }: { where: { id: string } }) {
        const session = sessions.find((s) => s.id === where.id);
        if (!session) return null;
        const user = users.find((u) => u.id === session.userId);
        return user ? { ...session, user } : null;
      },
      async deleteMany({ where }: { where: { id: string } }) {
        const before = sessions.length;
        const remaining = sessions.filter((s) => s.id !== where.id);
        sessions.length = 0;
        sessions.push(...remaining);
        return { count: before - remaining.length };
      },
    },
    watchlistItem: {
      async findMany({ where }: { where: { userId: string } }) {
        return watchlistItems.filter((w) => w.userId === where.userId);
      },
      async findUnique({ where }: { where: { userId_symbol: { userId: string; symbol: string } } }) {
        const { userId, symbol } = where.userId_symbol;
        return watchlistItems.find((w) => w.userId === userId && w.symbol === symbol) ?? null;
      },
      async create({ data }: { data: { userId: string; symbol: string } }) {
        const item: FakeWatchlistItem = { id: nextId("watch"), addedAt: new Date(), ...data };
        watchlistItems.push(item);
        return item;
      },
      async deleteMany({ where }: { where: { userId: string; symbol: string } }) {
        const before = watchlistItems.length;
        const remaining = watchlistItems.filter(
          (w) => !(w.userId === where.userId && w.symbol === where.symbol),
        );
        watchlistItems.length = 0;
        watchlistItems.push(...remaining);
        return { count: before - remaining.length };
      },
    },
    snapshot: {
      async findUnique({ where }: { where: { userId_symbol: { userId: string; symbol: string } } }) {
        const { userId, symbol } = where.userId_symbol;
        return snapshots.find((s) => s.userId === userId && s.symbol === symbol) ?? null;
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { userId_symbol: { userId: string; symbol: string } };
        create: { userId: string; symbol: string; price: number; timestamp: Date };
        update: { price: number; timestamp: Date };
      }) {
        const { userId, symbol } = where.userId_symbol;
        const existing = snapshots.find((s) => s.userId === userId && s.symbol === symbol);
        if (existing) {
          existing.price = update.price;
          existing.timestamp = update.timestamp;
          return existing;
        }
        const snapshot: FakeSnapshot = { id: nextId("snap"), ...create };
        snapshots.push(snapshot);
        return snapshot;
      },
      async deleteMany({ where }: { where: { userId: string; symbol: string } }) {
        const before = snapshots.length;
        const remaining = snapshots.filter(
          (s) => !(s.userId === where.userId && s.symbol === where.symbol),
        );
        snapshots.length = 0;
        snapshots.push(...remaining);
        return { count: before - remaining.length };
      },
    },
    async $disconnect() {},
  };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
