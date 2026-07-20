import { NextResponse } from "next/server";

import { readBuiltChat } from "@/lib/build-chats";
import { readLocalChat } from "@/lib/local-chats";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const built = await readBuiltChat(slug);

    if (built) {
      return NextResponse.json({
        slug: built.slug,
        chatTitle: built.title,
        participants: built.participants,
        defaultMyName: built.defaultMyName,
        mediaFiles: built.mediaFiles,
        mediaBaseUrl: `/api/chats/${built.slug}/media`,
        builtAt: built.builtAt,
        messages: built.messages,
      });
    }

    const chat = await readLocalChat(slug);

    return NextResponse.json({
      slug: chat.slug,
      chatTitle: chat.chatTitle,
      participants: chat.participants,
      mediaFiles: chat.mediaFiles,
      mediaBaseUrl: `/api/chats/${chat.slug}/media`,
      messages: chat.messages.map((message) => ({
        ...message,
        date: message.date.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat konnte nicht geladen werden." },
      { status: 404 },
    );
  }
}
