import { NextResponse } from "next/server";

import { hasValidSession, isAuthConfigured, isAuthDisabled } from "@/lib/auth";

/** Use in route handlers that are excluded from middleware (e.g. large uploads). */
export async function requireApiSession(request: Request): Promise<NextResponse | null> {
  if (isAuthDisabled()) return null;

  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Login ist nicht konfiguriert. Bitte ARCHIVE_PASSWORD und AUTH_SECRET setzen.",
      },
      { status: 503 },
    );
  }

  const ok = await hasValidSession(request.headers.get("cookie"));
  if (ok) return null;

  return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
}
