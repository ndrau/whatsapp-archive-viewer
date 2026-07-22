import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";

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
