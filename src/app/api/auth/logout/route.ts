import { NextResponse } from "next/server";

import { buildClearSessionCookieHeader } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", buildClearSessionCookieHeader(request.url, request));
  return response;
}
