import { SimulatedProvider } from "@ledger/core";
import { prisma } from "@ledger/database";
import { buildApp } from "./app.js";
import { createCache } from "./cache/index.js";
import { env } from "./env.js";
import { MarketEngine } from "./market/engine.js";

async function main(): Promise<void> {
  const provider = new SimulatedProvider();
  const cache = createCache();
  const engine = new MarketEngine(provider, cache);

  const distinctSymbols = await prisma.watchlistItem.findMany({
    select: { symbol: true },
    distinct: ["symbol"],
  });
  await engine.bootstrap(distinctSymbols.map((row) => row.symbol));

  const app = await buildApp({ engine });

  app.addHook("onClose", async () => {
    provider.stop();
    await prisma.$disconnect();
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(
    `Ledger API listening on :${env.PORT} (${engine.activeSubscriptionCount()} symbol subscriptions bootstrapped)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
