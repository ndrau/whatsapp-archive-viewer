import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/require-auth";
import { readUploadJob } from "@/lib/upload-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const authError = await requireApiSession(request);
  if (authError) return authError;

  const { jobId } = await context.params;

  try {
    const job = await readUploadJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Status konnte nicht geladen werden." },
      { status: 400 },
    );
  }
}
