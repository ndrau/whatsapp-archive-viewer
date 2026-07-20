import { NextResponse } from "next/server";

import { isChatUploadEnabled } from "@/lib/chat-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    allowChatUpload: isChatUploadEnabled(),
  });
}
