import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  getAuthSecret,
  isAuthConfigured,
  isAuthDisabled,
  parseCookieValue,
  verifySessionToken,
} from "@/lib/auth";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/logout") return true;
  return false;
}

function wantsJson(request: NextRequest): boolean {
  if (request.nextUrl.pathname.startsWith("/api/")) return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthDisabled()) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    // Already logged in → skip login page
    if (pathname === "/login" && isAuthConfigured()) {
      const secret = getAuthSecret();
      const token = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
      if (secret && (await verifySessionToken(token, secret))) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    if (wantsJson(request)) {
      return NextResponse.json(
        {
          error:
            "Login ist nicht konfiguriert. Bitte ARCHIVE_PASSWORD und AUTH_SECRET setzen.",
        },
        { status: 503 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const secret = getAuthSecret();
  const token = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  const valid = secret ? await verifySessionToken(token, secret) : false;

  if (valid) {
    return NextResponse.next();
  }

  if (wantsJson(request)) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next internals and common static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
