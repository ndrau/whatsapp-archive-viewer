"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface LogoutButtonProps {
  variant?: "light" | "dark";
}

export function LogoutButton({ variant = "light" }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const className =
    variant === "light"
      ? "rounded-full border border-white/25 px-3 py-1.5 text-sm font-medium text-white"
      : "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-[var(--wa-text)]";

  return (
    <button type="button" className={className} onClick={() => void logout()} disabled={loading}>
      {loading ? "…" : "Abmelden"}
    </button>
  );
}
