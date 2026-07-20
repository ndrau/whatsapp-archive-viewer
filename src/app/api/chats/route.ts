import { NextResponse } from "next/server";

import { readBuiltManifest } from "@/lib/build-chats";

export async function GET() {
  try {
    const manifest = await readBuiltManifest();

    if (manifest) {
      return NextResponse.json({ chats: manifest.chats, builtAt: manifest.builtAt });
    }

    return NextResponse.json(
      {
        error: "Kein Chat-Build gefunden. Bitte npm run build:chats ausführen.",
        chats: [],
      },
      { status: 503 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chats konnten nicht geladen werden." },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const { buildAllChats } = await import("@/lib/build-chats");
    const manifest = await buildAllChats();
    return NextResponse.json({ ok: true, manifest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat-Build fehlgeschlagen." },
      { status: 500 },
    );
  }
}
