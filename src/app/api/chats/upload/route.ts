import { NextResponse } from "next/server";

import {
  isChatUploadEnabled,
  parseUploadRequest,
  processUploadedChat,
} from "@/lib/chat-upload";
import { requireApiSession } from "@/lib/require-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = await requireApiSession(request);
  if (authError) return authError;

  if (!isChatUploadEnabled()) {
    return NextResponse.json(
      { error: "Das Hochladen neuer Chats ist derzeit deaktiviert." },
      { status: 403 },
    );
  }

  try {
    const { job, zipPath, fields } = await parseUploadRequest(request);

    // Long-running Next server (Docker): continue after response.
    void processUploadedChat({
      jobId: job.id,
      zipPath,
      slug: fields.slug,
      title: fields.title,
      defaultMyName: fields.defaultMyName,
    });

    return NextResponse.json({
      jobId: job.id,
      slug: fields.slug,
      status: job.status,
      message: job.message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload fehlgeschlagen." },
      { status: 400 },
    );
  }
}
