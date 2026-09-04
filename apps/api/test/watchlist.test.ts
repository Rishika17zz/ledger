import type { FastifyInstance } from "fastify";
import { SimulatedProvider } from "@ledger/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@ledger/database", async () => {
  const { createFakePrisma } = await import("./fake-prisma.js");
  return { prisma: createFakePrisma() };
});

const { buildApp } = await import("../src/app.js");
const { InMemoryCache } = await import("../src/cache/in-memory-cache.js");
const { MarketEngine } = await import("../src/market/engine.js");

let app: FastifyInstance;
let provider: SimulatedProvider;
let cookie: string;

beforeAll(async () => {
  provider = new SimulatedProvider();
  const engine = new MarketEngine(provider, new InMemoryCache());
  app = await buildApp({ engine });

  const signup = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: { email: "watcher@ledger.dev", password: "correcthorse" },
  });
  const raw = signup.headers["set-cookie"];
  cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(";")[0] ?? "";
});

afterAll(async () => {
  await app.close();
  provider.stop();
});

describe("watchlist", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/watchlist" });
    expect(res.statusCode).toBe(401);
  });

  it("starts empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/watchlist", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("rejects adding a symbol outside the tracked universe", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/watchlist",
      headers: { cookie },
      payload: { symbol: "NOPE" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("adds a known symbol and lists it back", async () => {
    const add = await app.inject({
      method: "POST",
      url: "/api/watchlist",
      headers: { cookie },
      payload: { symbol: "ardx" },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().symbol).toBe("ARDX");

    const list = await app.inject({ method: "GET", url: "/api/watchlist", headers: { cookie } });
    expect(list.json()).toHaveLength(1);
  });

  it("is idempotent when adding the same symbol twice", async () => {
    await app.inject({
      method: "POST",
      url: "/api/watchlist",
      headers: { cookie },
      payload: { symbol: "NOVU" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/watchlist",
      headers: { cookie },
      payload: { symbol: "NOVU" },
    });
    expect(second.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/watchlist", headers: { cookie } });
    expect(list.json()).toHaveLength(2);
  });

  it("removes a symbol", async () => {
    await app.inject({ method: "DELETE", url: "/api/watchlist/NOVU", headers: { cookie } });
    const list = await app.inject({ method: "GET", url: "/api/watchlist", headers: { cookie } });
    expect(list.json()).toHaveLength(1);
  });

  it("scores the watchlist and marks the first view as quiet with no prior snapshot", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/watchlist/attention",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const results = res.json();
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("ARDX");
    expect(results[0].since).toBeNull();
    expect(results[0].tier).toBe("quiet");
  });

  it("checkpoints the snapshot so a second immediate visit compares against the first", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/watchlist/attention",
      headers: { cookie },
    });
    const results = res.json();
    expect(results[0].since).not.toBeNull();
  });
});
