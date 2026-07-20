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
        error: "Kein Chat-Build gefunden. Bitte pnpm run build:chats ausführen.",
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
