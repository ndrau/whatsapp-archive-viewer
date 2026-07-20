"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { safeInternalPath } from "@/lib/safe-next";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error || "Login fehlgeschlagen.");
        return;
      }

      router.replace(safeInternalPath(searchParams.get("next")));
      router.refresh();
    } catch {
      setError("Login fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--wa-page-bg)]">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-[28px] bg-[var(--wa-accent)] px-6 py-8 text-white shadow-xl">
          <p className="text-sm uppercase tracking-[0.24em] text-white/70">WhatsApp Archiv</p>
          <h1 className="mt-2 text-3xl font-semibold">Login</h1>
          <p className="mt-3 text-sm leading-6 text-white/85">
            Geschützter Bereich — bitte Passwort eingeben.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-6 rounded-3xl bg-white/95 p-6 shadow-sm"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--wa-text)]">Passwort</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
              required
              autoFocus
            />
          </label>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="mt-5 w-full rounded-full bg-[var(--wa-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Wird geprüft…" : "Einloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--wa-page-bg)] text-[var(--wa-muted)]">
          Login wird geladen…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
