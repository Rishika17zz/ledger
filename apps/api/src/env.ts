import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
