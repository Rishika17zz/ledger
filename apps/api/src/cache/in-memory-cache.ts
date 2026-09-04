import type { CacheProvider } from "./cache-provider.js";

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/** In-process stand-in for Redis. Same interface, no external dependency. */
export class InMemoryCache implements CacheProvider {
  private readonly store = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
