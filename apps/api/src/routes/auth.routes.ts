import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@ledger/database";
import {
  clearSessionCookie,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
} from "../auth/auth.plugin.js";
import { createSession, destroySession, hashPassword, verifyPassword } from "../auth/auth.service.js";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/signup", async (request, reply) => {
    const parsed = CredentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
    }
    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "An account with that email already exists." });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, passwordHash } });
    const session = await createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    return reply.code(201).send({ id: user.id, email: user.email });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = CredentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Enter a valid email and password." });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Incorrect email or password." });
    }

    const session = await createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    return reply.send({ id: user.id, email: user.email });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) await destroySession(sessionId);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(request.user);
  });
}
