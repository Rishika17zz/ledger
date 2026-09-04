import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { resolveSession, type AuthenticatedUser } from "./auth.service.js";

export const SESSION_COOKIE = "ledger_sid";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (!sessionId) {
      request.user = null;
      return;
    }
    request.user = await resolveSession(sessionId);
  });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    await reply.code(401).send({ error: "Not authenticated." });
  }
}

export function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}
