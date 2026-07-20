"use client";

import { buildMediaUrl } from "@/lib/media-types";
import type { MediaGalleryItem } from "@/lib/media-groups";
import { getPreviewItems } from "@/lib/media-groups";
import type { WhatsAppExport } from "@/types/whatsapp";

interface MediaGridProps {
  items: MediaGalleryItem[];
  exportData: WhatsAppExport;
  onOpen: (index: number) => void;
}

function gridLayoutClass(count: number): string {
  if (count === 1) return "media-grid media-grid-1";
  if (count === 2) return "media-grid media-grid-2";
  if (count === 3) return "media-grid media-grid-3";
  return "media-grid media-grid-4";
}

export function MediaGrid({ items, exportData, onOpen }: MediaGridProps) {
  const { visible, hiddenCount } = getPreviewItems(items);
  const layoutCount = visible.length;

  return (
    <button
      type="button"
      className={`${gridLayoutClass(layoutCount)} mb-2 w-full min-w-[220px] max-w-[320px] overflow-hidden rounded-xl`}
      onClick={() => onOpen(0)}
      aria-label={`${items.length} Medien anzeigen`}
    >
      {visible.map((item, index) => {
        const mediaUrl = buildMediaUrl(item.attachment.filename, exportData);
        const isLast = index === visible.length - 1;
        const showOverlay = hiddenCount > 0 && isLast;

        return (
          <div key={item.messageId} className="relative aspect-square overflow-hidden bg-black/5">
            {!mediaUrl ? (
              <div className="flex h-full items-center justify-center px-2 text-center text-xs text-[var(--wa-muted)]">
                Datei fehlt
              </div>
            ) : item.attachment.kind === "video" ? (
              <>
                <video
                  preload="metadata"
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
          </div>
        );
      })}
    </button>
  );
}
