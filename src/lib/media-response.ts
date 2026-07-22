import { spawn } from "child_process";
import { createHash } from "crypto";
import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";

import { getMediaContentType } from "@/lib/local-chats";

const PLAYABLE_DIR = path.join(process.cwd(), ".built", "playable");
const IOS_INCOMPATIBLE_AUDIO = new Set([".opus", ".ogg"]);

const transcodeLocks = new Map<string, Promise<string>>();

function parseRange(
  rangeHeader: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;

  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return null;

  let start = hasStart ? Number.parseInt(match[1], 10) : Number.NaN;
  let end = hasEnd ? Number.parseInt(match[2], 10) : Number.NaN;

  if (!hasStart && hasEnd) {
    // suffix: bytes=-N → last N bytes
    const suffix = end;
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isFinite(start) || start < 0) return null;
    if (!Number.isFinite(end)) end = size - 1;
    end = Math.min(end, size - 1);
  }

  if (start > end || start >= size) return null;
  return { start, end };
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000);
      }
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `ffmpeg nicht verfügbar (${error.message}). Sprachnachrichten brauchen ffmpeg für iOS.`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg fehlgeschlagen (code ${code}): ${stderr.trim()}`));
    });
  });
}

async function transcodeOpusToAac(inputPath: string, outputPath: string): Promise<void> {
  const tmpPath = `${outputPath}.${process.pid}.${Date.now()}.tmp.m4a`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-movflags",
      "+faststart",
      tmpPath,
    ]);
    await fs.rename(tmpPath, outputPath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}

/**
 * iOS Safari cannot play WhatsApp Opus/Ogg voice notes. Convert once to AAC/M4A
 * and cache under `.built/playable/` so desktop and mobile share the same URL.
 */
export async function resolvePlayableMedia(
  originalPath: string,
): Promise<{ filePath: string; contentType: string }> {
  const ext = path.extname(originalPath).toLowerCase();
  if (!IOS_INCOMPATIBLE_AUDIO.has(ext)) {
    return {
      filePath: originalPath,
      contentType: getMediaContentType(originalPath),
    };
  }

  const stats = await fs.stat(originalPath);
  const cacheKey = createHash("sha1")
    .update(originalPath)
    .update("\0")
    .update(String(stats.mtimeMs))
    .update("\0")
    .update(String(stats.size))
    .digest("hex");
  const outputPath = path.join(PLAYABLE_DIR, `${cacheKey}.m4a`);

  try {
    await fs.access(outputPath);
    return { filePath: outputPath, contentType: "audio/mp4" };
  } catch {
    // need transcode
  }

  const existing = transcodeLocks.get(outputPath);
  if (existing) {
    const filePath = await existing;
    return { filePath, contentType: "audio/mp4" };
  }

  const pending = transcodeOpusToAac(originalPath, outputPath)
    .then(() => outputPath)
    .finally(() => {
      transcodeLocks.delete(outputPath);
    });

  transcodeLocks.set(outputPath, pending);
  const filePath = await pending;
  return { filePath, contentType: "audio/mp4" };
}

function commonHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function createMediaResponse(
  request: Request,
  filePath: string,
  contentType: string,
): Promise<NextResponse> {
  const stats = await fs.stat(filePath);
  const size = stats.size;
  const method = request.method.toUpperCase();
  const headers = commonHeaders(contentType);

  if (method === "HEAD") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...headers,
        "Content-Length": String(size),
      },
    });
  }

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...headers,
          "Content-Range": `bytes */${size}`,
        },
      });
    }

    const { start, end } = range;
    const chunkSize = end - start + 1;
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, start);
      return new NextResponse(buffer.subarray(0, bytesRead), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(bytesRead),
        },
      });
    } finally {
      await handle.close();
    }
  }

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      ...headers,
      "Content-Length": String(size),
    },
  });
}
