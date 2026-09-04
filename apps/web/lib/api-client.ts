import type { AttentionResult, SymbolMeta } from "@ledger/core";
import { API_URL } from "./config";

export interface WatchlistItemDto {
  symbol: string;
  addedAt: string;
}

export interface UserDto {
  id: string;
  email: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Response had no JSON body; fall back to statusText.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  signup: (email: string, password: string) =>
    request<UserDto>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<UserDto>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<UserDto>("/api/auth/me"),
  symbols: () => request<SymbolMeta[]>("/api/symbols"),
  watchlist: () => request<WatchlistItemDto[]>("/api/watchlist"),
  addSymbol: (symbol: string) =>
    request<WatchlistItemDto>("/api/watchlist", { method: "POST", body: JSON.stringify({ symbol }) }),
  removeSymbol: (symbol: string) =>
    request<void>(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" }),
  attention: () => request<AttentionResult[]>("/api/watchlist/attention"),
};
