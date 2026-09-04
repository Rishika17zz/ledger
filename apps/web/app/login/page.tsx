"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { api } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();

  async function handleLogin(email: string, password: string) {
    await api.login(email, password);
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <p className="text-h1">Ledger</p>
        <p className="mt-1 text-small text-text-secondary">Attention triage for your watchlist.</p>
      </div>
      <AuthForm mode="login" onSubmit={handleLogin} />
      <p className="mt-6 text-small text-text-tertiary">
        New here?{" "}
        <Link href="/signup" className="text-accent-focus hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
