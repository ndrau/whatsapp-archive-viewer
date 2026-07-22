"use client";

import { useEffect, useMemo, useState } from "react";

import { buildMediaUrl } from "@/lib/media-types";
import type { MediaGalleryItem } from "@/lib/media-groups";
import { getPreviewItems } from "@/lib/media-groups";
import type { WhatsAppExport } from "@/types/whatsapp";

interface MediaGridProps {
  items: MediaGalleryItem[];
  exportData: WhatsAppExport;
  onOpen: (index: number) => void;
}

type Orientation = "landscape" | "portrait" | "square";
type PairLayout = "stack" | "split";

interface MediaSize {
  width: number;
  height: number;
}

function orientationFromSize(width: number, height: number): Orientation {
  const ratio = width / Math.max(height, 1);
  if (ratio > 1.08) return "landscape";
  if (ratio < 0.92) return "portrait";
  return "square";
}

/** WhatsApp-like: landscape albums stack; portrait albums sit side-by-side. */
function resolvePairLayout(orientations: Orientation[]): PairLayout {
  let landscapeScore = 0;
  let portraitScore = 0;

  for (const orientation of orientations) {
    if (orientation === "landscape") landscapeScore += 1;
    if (orientation === "portrait") portraitScore += 1;
  }

  return landscapeScore >= portraitScore ? "stack" : "split";
}

function loadMediaSize(
  url: string,
  kind: string,
): { promise: Promise<MediaSize | null>; cancel: () => void } {
  let settled = false;

  if (kind === "video") {
    const video = document.createElement("video");
    video.preload = "metadata";

    const promise = new Promise<MediaSize | null>((resolve) => {
      const finish = (size: MediaSize | null) => {
        if (settled) return;
        settled = true;
        resolve(size);
      };

      video.onloadedmetadata = () => {
        finish(
          video.videoWidth > 0 && video.videoHeight > 0
            ? { width: video.videoWidth, height: video.videoHeight }
            : null,
        );
      };
      video.onerror = () => finish(null);
      video.src = url;
    });

    return {
      promise,
      cancel: () => {
        settled = true;
        video.removeAttribute("src");
        video.load();
      },
    };
  }

  const image = new Image();
  const promise = new Promise<MediaSize | null>((resolve) => {
    const finish = (size: MediaSize | null) => {
      if (settled) return;
      settled = true;
      resolve(size);
    };

    image.onload = () => {
      finish(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null,
      );
    };
    image.onerror = () => finish(null);
    image.src = url;
  });

  return {
    promise,
    cancel: () => {
      settled = true;
      image.onload = null;
      image.onerror = null;
      image.src = "";
    },
  };
}

function gridClassName(count: number, pairLayout: PairLayout, trioLayout: PairLayout): string {
  if (count <= 1) return "media-grid media-grid-1";
  if (count === 2) {
    return pairLayout === "stack" ? "media-grid media-grid-2-stack" : "media-grid media-grid-2-split";
  }
  if (count === 3) {
    return trioLayout === "stack" ? "media-grid media-grid-3-stack" : "media-grid media-grid-3-split";
  }
  return "media-grid media-grid-4";
}

export function MediaGrid({ items, exportData, onOpen }: MediaGridProps) {
  const { visible, hiddenCount } = getPreviewItems(items);
  const [sizes, setSizes] = useState<Array<MediaSize | null>>([]);

  const mediaKey = visible.map((item) => item.attachment.filename).join("|");

  useEffect(() => {
    let cancelled = false;
    const loaders: Array<{ cancel: () => void }> = [];

    void (async () => {
      const next = await Promise.all(
        visible.map(async (item) => {
          const url = buildMediaUrl(item.attachment.filename, exportData);
          if (!url) return null;
          const loader = loadMediaSize(url, item.attachment.kind);
          loaders.push(loader);
          return loader.promise;
        }),
      );

      if (!cancelled) setSizes(next);
    })();

    return () => {
      cancelled = true;
      for (const loader of loaders) loader.cancel();
    };
    // visible is derived from items; mediaKey captures identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportData, mediaKey]);

  const orientations = useMemo(
    () =>
      sizes.map((size) =>
        size ? orientationFromSize(size.width, size.height) : ("square" as Orientation),
      ),
    [sizes],
  );

  const pairLayout = useMemo<PairLayout>(() => {
    if (visible.length !== 2) return "stack";
    if (orientations.length < 2) return "stack";
    return resolvePairLayout(orientations);
  }, [orientations, visible.length]);

  const trioLayout = useMemo<PairLayout>(() => {
    if (visible.length !== 3) return "split";
    if (orientations.length < 3) return "stack";
    return resolvePairLayout(orientations);
  }, [orientations, visible.length]);

  const layoutClass = gridClassName(visible.length, pairLayout, trioLayout);

  return (
    <div
      className={`${layoutClass} mb-2 w-full min-w-[220px] max-w-[320px] overflow-hidden rounded-xl`}
      role="group"
      aria-label={`${items.length} Medien`}
    >
      {visible.map((item, index) => {
        const mediaUrl = buildMediaUrl(item.attachment.filename, exportData);
        const isLast = index === visible.length - 1;
        const showOverlay = hiddenCount > 0 && isLast;
        const size = sizes[index];
        const aspectStyle =
          size && visible.length <= 2
            ? { aspectRatio: `${size.width} / ${size.height}` }
            : undefined;

        return (
          <button
            key={item.messageId}
            type="button"
            className="media-grid-cell relative overflow-hidden bg-black/5"
            style={aspectStyle}
            onClick={() => onOpen(index)}
            aria-label={`Medium ${index + 1} von ${items.length} öffnen`}
          >
            {!mediaUrl ? (
              <div className="flex h-full items-center justify-center px-2 text-center text-xs text-[var(--wa-muted)]">
                Datei fehlt
              </div>
            ) : item.attachment.kind === "video" ? (
              <>
                <video
                  playsInline
                  preload="metadata"
                  muted
                  src={mediaUrl}
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  Video
                </span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt={item.attachment.filename}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            )}

            {showOverlay && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">
                +{hiddenCount}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
