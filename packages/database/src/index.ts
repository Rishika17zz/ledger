import { PrismaClient } from "@prisma/client";

declare global {
  var __ledgerPrisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. In dev, processes get hot-reloaded (tsx watch,
 * Next.js) more often than the connection pool should be recycled, so we
 * stash the client on globalThis the same way Prisma's own docs recommend.
 */
export const prisma = globalThis.__ledgerPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__ledgerPrisma = prisma;
}

export * from "@prisma/client";
