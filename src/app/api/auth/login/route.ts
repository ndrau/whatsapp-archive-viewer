import { NextResponse } from "next/server";

import {
  buildSessionCookieHeader,
  createSessionToken,
  getArchivePassword,
  getAuthSecret,
  isAuthConfigured,
  isAuthDisabled,
  passwordsMatch,
} from "@/lib/auth";
import { clientKeyFromRequest, takeRateLimitSlot } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  if (isAuthDisabled()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Login ist nicht konfiguriert. Bitte ARCHIVE_PASSWORD und AUTH_SECRET (mind. 32 Zeichen) setzen.",
      },
      { status: 503 },
    );
  }

  const rate = takeRateLimitSlot(`login:${clientKeyFromRequest(request)}`, {
    limit: LOGIN_LIMIT,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Zu viele Login-Versuche. Bitte später erneut versuchen." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const expected = getArchivePassword();
  const secret = getAuthSecret();
  if (!expected || !secret) {
    return NextResponse.json({ error: "Login ist nicht konfiguriert." }, { status: 503 });
  }

  if (!passwordsMatch(password, expected)) {
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }

  const { token, expiresAt } = await createSessionToken(secret);
  const response = NextResponse.json({ ok: true, expiresAt });
  response.headers.append(
    "Set-Cookie",
    buildSessionCookieHeader(token, expiresAt, request.url, request),
  );
  return response;
}
