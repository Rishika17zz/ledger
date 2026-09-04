"use client";

import { useState, type FormEvent } from "react";

export function AuthForm({
  mode,
  onSubmit,
}: {
  mode: "login" | "signup";
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-small text-text-secondary">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-body text-text-primary focus-visible:border-accent-focus"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-small text-text-secondary">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-body text-text-primary focus-visible:border-accent-focus"
        />
      </div>

      {error && (
        <p role="alert" className="text-small text-signal-loss">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent-focus px-3 py-2 text-body font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
      </button>
    </form>
  );
}
