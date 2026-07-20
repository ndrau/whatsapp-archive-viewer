import { NextResponse } from "next/server";

import { DEFAULT_DAY_RADIUS, selectDayRange } from "@/lib/chat-day";
import {
  loadAllBuiltMessages,
  loadMessagesForDayRange,
  loadMessagesForDayWindow,
  readBuiltChatIndex,
} from "@/lib/chat-store";
import { requireApiSession } from "@/lib/require-auth";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/** Cap day radius / ranges so a single request cannot load an entire archive. */
const MAX_DAY_RADIUS = 31;
const MAX_DAY_SPAN = 62;

export async function GET(request: Request, { params }: RouteParams) {
  const authError = await requireApiSession(request);
  if (authError) return authError;

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
      const index = await readBuiltChatIndex(slug);
      if (!index) {
        return NextResponse.json({ error: "Chat nicht gefunden." }, { status: 404 });
      }

      const span = selectDayRange(index.days, fromDay, toDay);
      if (span.length === 0) {
        return NextResponse.json({ error: "Ungültiger Zeitraum." }, { status: 400 });
      }
      if (span.length > MAX_DAY_SPAN) {
        return NextResponse.json(
          {
            error: `Zeitraum zu groß (max. ${MAX_DAY_SPAN} Tage). Bitte kleineren Ausschnitt laden.`,
          },
          { status: 400 },
        );
      }

      const { messages, dayKeys } = await loadMessagesForDayRange(slug, fromDay, toDay);
      return NextResponse.json({ fromDay, toDay, dayKeys, messages });
    }

    const centerDay = url.searchParams.get("centerDay") ?? undefined;
    const radiusRaw = Number(url.searchParams.get("radius") ?? DEFAULT_DAY_RADIUS);
    const radius = Number.isFinite(radiusRaw)
      ? Math.min(MAX_DAY_RADIUS, Math.max(0, radiusRaw))
      : DEFAULT_DAY_RADIUS;
    const { messages, dayKeys } = await loadMessagesForDayWindow(slug, centerDay, radius);

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
