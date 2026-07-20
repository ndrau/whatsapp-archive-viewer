import { NextResponse } from "next/server";

import { deleteChat } from "@/lib/chat-delete";
import { readBuiltChatIndex } from "@/lib/chat-store";
import { requireApiSession } from "@/lib/require-auth";
import { isValidSlug } from "@/lib/slug";

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

export async function DELETE(request: Request, { params }: RouteParams) {
  const authError = await requireApiSession(request);
  if (authError) return authError;

  try {
    const { slug } = await params;
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "Ungültiger Chat-Name." }, { status: 400 });
    }

    await deleteChat(slug);
    return NextResponse.json({ ok: true, slug });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat konnte nicht gelöscht werden.";
    const status = message === "Chat nicht gefunden." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
