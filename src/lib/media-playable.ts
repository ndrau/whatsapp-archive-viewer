import { spawn } from "child_process";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { getMediaContentType } from "@/lib/local-chats";

const PLAYABLE_DIR = path.join(process.cwd(), ".built", "playable");
const IOS_INCOMPATIBLE_AUDIO = new Set([".opus", ".ogg"]);

const transcodeLocks = new Map<string, Promise<string>>();

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

function isIosIncompatibleAudio(filePath: string): boolean {
  return IOS_INCOMPATIBLE_AUDIO.has(path.extname(filePath).toLowerCase());
}

function playableCachePath(originalPath: string, mtimeMs: number, size: number): string {
  const cacheKey = createHash("sha1")
    .update(originalPath)
    .update("\0")
    .update(String(mtimeMs))
    .update("\0")
    .update(String(size))
    .digest("hex");
  return path.join(PLAYABLE_DIR, `${cacheKey}.m4a`);
}

async function ensureAacCache(originalPath: string): Promise<{
  filePath: string;
  created: boolean;
}> {
  const stats = await fs.stat(originalPath);
  const outputPath = playableCachePath(originalPath, stats.mtimeMs, stats.size);

  try {
    await fs.access(outputPath);
    return { filePath: outputPath, created: false };
  } catch {
    // need transcode
  }

  const existing = transcodeLocks.get(outputPath);
  if (existing) {
    const filePath = await existing;
    return { filePath, created: false };
  }

  const pending = transcodeOpusToAac(originalPath, outputPath)
    .then(() => outputPath)
    .finally(() => {
      transcodeLocks.delete(outputPath);
    });

  transcodeLocks.set(outputPath, pending);
  const filePath = await pending;
  return { filePath, created: true };
}

/**
 * iOS Safari cannot play WhatsApp Opus/Ogg voice notes. Convert once to AAC/M4A
 * and cache under `.built/playable/` so desktop and mobile share the same URL.
 *
 * Kept free of `next/*` so Docker chat builds (tsx + standalone) can import it.
 */
export async function resolvePlayableMedia(
  originalPath: string,
): Promise<{ filePath: string; contentType: string }> {
  if (!isIosIncompatibleAudio(originalPath)) {
    return {
      filePath: originalPath,
      contentType: getMediaContentType(originalPath),
    };
  }

  const { filePath } = await ensureAacCache(originalPath);
  return { filePath, contentType: "audio/mp4" };
}

export interface PrewarmPlayableAudioResult {
  total: number;
  converted: number;
  cached: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Convert all Opus/Ogg files in a chat during build so iPhone playback is
 * instant. Safe to re-run: existing AAC caches are reused.
 */
export async function prewarmPlayableAudioForChat(
  sourceDir: string,
  mediaFiles: string[],
  options?: { concurrency?: number },
): Promise<PrewarmPlayableAudioResult> {
  const targets = mediaFiles.filter((file) => isIosIncompatibleAudio(file));
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 2, 4));
  const result: PrewarmPlayableAudioResult = {
    total: targets.length,
    converted: 0,
    cached: 0,
    failed: 0,
    errors: [],
  };

  if (targets.length === 0) {
    return result;
  }

  let nextIndex = 0;

  async function worker() {
    while (nextIndex < targets.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = targets[index]!;
      const originalPath = path.join(sourceDir, file);

      try {
        const { created } = await ensureAacCache(originalPath);
        if (created) result.converted += 1;
        else result.cached += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
  );

  return result;
}
