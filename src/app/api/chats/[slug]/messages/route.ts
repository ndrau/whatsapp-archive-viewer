import { NextResponse } from "next/server";

import { DEFAULT_DAY_RADIUS } from "@/lib/chat-day";
import { loadAllBuiltMessages, loadMessagesForDayRange, loadMessagesForDayWindow } from "@/lib/chat-store";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);

    if (url.searchParams.get("all") === "1") {
      const messages = await loadAllBuiltMessages(slug);
      return NextResponse.json({ messages });
    }

    const fromDay = url.searchParams.get("fromDay");
    const toDay = url.searchParams.get("toDay");

    if (fromDay && toDay) {
      const { messages, dayKeys } = await loadMessagesForDayRange(slug, fromDay, toDay);
      return NextResponse.json({ fromDay, toDay, dayKeys, messages });
    }

    const centerDay = url.searchParams.get("centerDay") ?? undefined;
    const radius = Number(url.searchParams.get("radius") ?? DEFAULT_DAY_RADIUS);
    const { messages, dayKeys } = await loadMessagesForDayWindow(
      slug,
      centerDay,
      Number.isFinite(radius) ? Math.max(0, radius) : DEFAULT_DAY_RADIUS,
    );

    return NextResponse.json({
      centerDay: centerDay ?? dayKeys.at(Math.floor(dayKeys.length / 2)),
      dayKeys,
      messages,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nachrichten konnten nicht geladen werden." },
      { status: 404 },
    );
  }
}
