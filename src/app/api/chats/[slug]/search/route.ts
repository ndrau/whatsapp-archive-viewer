import { NextResponse } from "next/server";

import { searchBuiltChat } from "@/lib/chat-store";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
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
