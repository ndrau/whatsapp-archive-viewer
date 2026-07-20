"use client";

import { useEffect } from "react";

import { buildMediaUrl } from "@/lib/media-types";
import type { MediaGalleryItem } from "@/lib/media-groups";
import type { WhatsAppExport } from "@/types/whatsapp";

interface MediaLightboxProps {
  items: MediaGalleryItem[];
  index: number;
  exportData: WhatsAppExport;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export function MediaLightbox({
  items,
  index,
  exportData,
  onClose,
  onChangeIndex,
}: MediaLightboxProps) {
  const current = items[index];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft") {
        onChangeIndex(index <= 0 ? items.length - 1 : index - 1);
      }

      if (event.key === "ArrowRight") {
        onChangeIndex(index >= items.length - 1 ? 0 : index + 1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [index, items.length, onChangeIndex, onClose]);

  if (!current) return null;

  const mediaUrl = buildMediaUrl(current.attachment.filename, exportData);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Medienansicht"
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        Schließen
      </button>

      {items.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-white backdrop-blur transition hover:bg-white/20"
            onClick={(event) => {
              event.stopPropagation();
              onChangeIndex(index <= 0 ? items.length - 1 : index - 1);
            }}
            aria-label="Vorheriges Medium"
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-white backdrop-blur transition hover:bg-white/20"
            onClick={(event) => {
              event.stopPropagation();
              onChangeIndex(index >= items.length - 1 ? 0 : index + 1);
            }}
            aria-label="Nächstes Medium"
          >
            ›
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white backdrop-blur">
            {index + 1} / {items.length}
          </p>
        </>
      )}

      <div
        className="flex max-h-[90vh] max-w-[92vw] items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        {!mediaUrl ? (
          <p className="rounded-xl bg-white/10 px-4 py-3 text-white">
            Datei fehlt: {current.attachment.filename}
          </p>
        ) : current.attachment.kind === "video" ? (
          <video
            controls
            autoPlay
            src={mediaUrl}
            className="max-h-[90vh] max-w-[92vw] rounded-xl"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt={current.attachment.filename}
            className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain"
          />
        )}
      </div>
    </div>
  );
}
