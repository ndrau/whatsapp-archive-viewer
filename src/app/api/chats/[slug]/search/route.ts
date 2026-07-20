import { NextResponse } from "next/server";

import { searchBuiltChat } from "@/lib/chat-store";
import { requireApiSession } from "@/lib/require-auth";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const authError = await requireApiSession(request);
  if (authError) return authError;

  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";

    if (!query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchBuiltChat(slug, query);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Suche fehlgeschlagen." },
      { status: 404 },
    );
  }
}
