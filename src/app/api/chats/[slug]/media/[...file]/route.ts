import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import { getMediaContentType, resolveLocalMediaPath } from "@/lib/local-chats";

interface RouteParams {
  params: Promise<{ slug: string; file: string[] }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { slug, file } = await params;
    const filename = decodeURIComponent(file.join("/"));
    const mediaPath = await resolveLocalMediaPath(slug, filename);
    const buffer = await readFile(mediaPath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": getMediaContentType(mediaPath),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mediendatei nicht gefunden." },
      { status: 404 },
    );
  }
}
