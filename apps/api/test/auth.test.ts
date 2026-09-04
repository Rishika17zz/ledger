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

beforeAll(async () => {
  provider = new SimulatedProvider();
  const engine = new MarketEngine(provider, new InMemoryCache());
  app = await buildApp({ engine });
});

afterAll(async () => {
  await app.close();
  provider.stop();
});

function cookieHeader(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return raw?.split(";")[0] ?? "";
}

describe("auth", () => {
  it("rejects signup with a short password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "short@ledger.dev", password: "123" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("signs a new user up and returns a session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "new@ledger.dev", password: "correcthorse" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a duplicate signup email", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "dupe@ledger.dev", password: "correcthorse" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "dupe@ledger.dev", password: "correcthorse" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("logs in with correct credentials and rejects incorrect ones", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "login@ledger.dev", password: "correcthorse" },
    });

    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login@ledger.dev", password: "wrongpassword" },
    });
    expect(wrong.statusCode).toBe(401);

    const right = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login@ledger.dev", password: "correcthorse" },
    });
    expect(right.statusCode).toBe(200);
  });

  it("rejects /api/auth/me without a session and accepts it with one", async () => {
    const anon = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(anon.statusCode).toBe(401);

    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "me@ledger.dev", password: "correcthorse" },
    });
    const cookie = cookieHeader(signup.headers["set-cookie"]);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("me@ledger.dev");
  });

  it("clears the session on logout", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "logout@ledger.dev", password: "correcthorse" },
    });
    const cookie = cookieHeader(signup.headers["set-cookie"]);

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});
