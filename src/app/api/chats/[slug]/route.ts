import { NextResponse } from "next/server";

import { readBuiltChatIndex } from "@/lib/chat-store";
import { requireApiSession } from "@/lib/require-auth";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const authError = await requireApiSession(request);
  if (authError) return authError;

  try {
    const { slug } = await params;
    const index = await readBuiltChatIndex(slug);

    if (!index) {
      return NextResponse.json({ error: "Chat nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json({
      slug: index.slug,
      chatTitle: index.title,
      participants: index.participants,
      defaultMyName: index.defaultMyName,
      mediaFiles: index.mediaFiles,
      mediaBaseUrl: `/api/chats/${index.slug}/media`,
      builtAt: index.builtAt,
      messageCount: index.messageCount,
      days: index.days,
      chunks: index.chunks,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat konnte nicht geladen werden." },
      { status: 500 },
    );
  }
}
