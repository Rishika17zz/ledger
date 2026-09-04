"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { api } from "@/lib/api-client";

export default function SignupPage() {
  const router = useRouter();

  async function handleSignup(email: string, password: string) {
    await api.signup(email, password);
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <p className="text-h1">Ledger</p>
        <p className="mt-1 text-small text-text-secondary">Attention triage for your watchlist.</p>
      </div>
      <AuthForm mode="signup" onSubmit={handleSignup} />
      <p className="mt-6 text-small text-text-tertiary">
        Already have an account?{" "}
        <Link href="/login" className="text-accent-focus hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
