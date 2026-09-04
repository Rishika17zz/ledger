/**
 * Cache abstraction for hot-path reads (latest quote per symbol, computed
 * attention scores per user+symbol). Backed by Redis in any real deployment;
 * an in-memory implementation stands in when REDIS_URL isn't set, so local
 * dev and CI don't need a Redis instance. Both implement this same
 * interface, so nothing above this layer knows or cares which one is live.
 */
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
}
