import { NextResponse } from "next/server";

import { resolveLocalMediaPath } from "@/lib/local-chats";
import {
  createMediaResponse,
  resolvePlayableMedia,
} from "@/lib/media-response";
import { requireApiSession } from "@/lib/require-auth";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ slug: string; file: string[] }>;
}

async function handleMedia(request: Request, { params }: RouteParams) {
  const authError = await requireApiSession(request);
  if (authError) return authError;

  try {
    const { slug, file } = await params;
    const filename = decodeURIComponent(file.join("/"));
    const mediaPath = await resolveLocalMediaPath(slug, filename);
    const playable = await resolvePlayableMedia(mediaPath);
    return createMediaResponse(request, playable.filePath, playable.contentType);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mediendatei nicht gefunden.";
    const status = /ffmpeg/i.test(message) ? 500 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: Request, context: RouteParams) {
  return handleMedia(request, context);
}

export async function HEAD(request: Request, context: RouteParams) {
  return handleMedia(request, context);
}
