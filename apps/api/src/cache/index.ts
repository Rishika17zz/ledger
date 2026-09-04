import { env } from "../env.js";
import type { CacheProvider } from "./cache-provider.js";
import { InMemoryCache } from "./in-memory-cache.js";
import { RedisCache } from "./redis-cache.js";

export type { CacheProvider } from "./cache-provider.js";

export function createCache(): CacheProvider {
  if (env.REDIS_URL) {
    return new RedisCache(env.REDIS_URL);
  }
  return new InMemoryCache();
}

export const CACHE_KEYS = {
  quote: (symbol: string): string => `quote:${symbol}`,
  attention: (userId: string, symbol: string): string => `attention:${userId}:${symbol}`,
};
