import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@ledger.dev";
const DEMO_PASSWORD = "demo1234";
const DEMO_SYMBOLS = ["ARDX", "NOVU", "QBIT", "VLTA", "NMBL"];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash },
  });

  for (const symbol of DEMO_SYMBOLS) {
    await prisma.watchlistItem.upsert({
      where: { userId_symbol: { userId: user.id, symbol } },
      update: {},
      create: { userId: user.id, symbol },
    });
  }

  console.log(`Seeded demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD} with ${DEMO_SYMBOLS.length} symbols.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
