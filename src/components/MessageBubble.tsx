"use client";

import { MessageText } from "@/components/MessageText";
import { MediaGrid } from "@/components/MediaGrid";
import { VoiceMessagePlayer } from "@/components/VoiceMessagePlayer";
import {
  buildMediaUrl,
  findMediaBlob,
  formatFileSize,
  isVoiceMessage,
} from "@/lib/media-types";
import type { MediaGalleryItem } from "@/lib/media-groups";
import type { ChatMessage, WhatsAppExport } from "@/types/whatsapp";

interface MessageBubbleProps {
  message: ChatMessage;
  exportData: WhatsAppExport;
  isOutgoing: boolean;
  onOpenMedia?: (items: MediaGalleryItem[], index: number) => void;
}

interface MediaAttachmentProps {
  message: ChatMessage;
  exportData: WhatsAppExport;
  timestamp: string;
  onOpenMedia?: (items: MediaGalleryItem[], index: number) => void;
}

function MediaAttachment({
  message,
  exportData,
  timestamp,
  onOpenMedia,
}: MediaAttachmentProps) {
  const attachment = message.attachment;

  if (!attachment) return null;

  if (attachment.omitted) {
    return (
      <p className="mb-2 text-sm italic text-[var(--wa-muted)]">
        Medium war beim Export nicht enthalten
      </p>
    );
  }

  if (!attachment.filename) return null;

  const mediaUrl = buildMediaUrl(attachment.filename, exportData);
  const blob = findMediaBlob(attachment.filename, exportData.mediaFiles);

  if (!mediaUrl) {
    return (
      <p className="mb-2 rounded-lg bg-black/5 px-3 py-2 text-sm text-[var(--wa-muted)]">
        Datei fehlt: {attachment.filename}
      </p>
    );
  }

  const galleryItem: MediaGalleryItem = {
    messageId: message.id,
    attachment,
  };

  const openMedia = () => onOpenMedia?.([galleryItem], 0);

  if (attachment.kind === "image" || attachment.kind === "sticker") {
    return (
      <button type="button" onClick={openMedia} className="mb-2 block max-w-full text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt={attachment.filename}
          className="h-64 max-w-full rounded-xl bg-black/5 object-cover"
          loading="lazy"
        />
      </button>
    );
  }

  if (attachment.kind === "video") {
    return (
      <button type="button" onClick={openMedia} className="relative mb-2 block max-w-full text-left">
        <video
          preload="metadata"
          src={mediaUrl}
          className="h-64 max-w-full rounded-xl bg-black/5 object-cover"
        />
        <span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
          Video öffnen
        </span>
      </button>
    );
  }

  if (attachment.kind === "audio") {
    const voice = isVoiceMessage(attachment.filename);

    if (voice) {
      return (
        <VoiceMessagePlayer
          src={mediaUrl}
          filename={attachment.filename}
          sender={message.sender}
          timestamp={timestamp}
        />
      );
    }

    return (
      <div className="mb-2 min-w-[240px] rounded-xl bg-black/5 px-3 py-2">
        <p className="mb-2 text-xs font-medium text-[var(--wa-muted)]">Audio</p>
        <audio controls preload="metadata" src={mediaUrl} className="w-full" />
      </div>
    );
  }

  return (
    <a
      href={mediaUrl}
      download={attachment.filename}
      className="mb-2 inline-flex rounded-lg bg-black/5 px-3 py-2 text-sm text-[var(--wa-accent)] hover:bg-black/10"
    >
      {attachment.filename}
      {blob ? ` · ${formatFileSize(blob.size)}` : ""}
    </a>
  );
}

export function MessageBubble({
  message,
  exportData,
  isOutgoing,
  onOpenMedia,
}: MessageBubbleProps) {
  const timestamp = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(message.date);

  const shortTimestamp = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(message.date);

  const isVoiceOnly =
    Boolean(message.attachment) &&
    message.attachment?.kind === "audio" &&
    message.attachment.filename &&
    isVoiceMessage(message.attachment.filename) &&
    !message.text;

  return (
    <article className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(100%,680px)] rounded-2xl px-3 py-2 shadow-sm ${
          isOutgoing
            ? "rounded-br-md bg-[var(--wa-outgoing)]"
            : "rounded-bl-md bg-[var(--wa-incoming)]"
        }`}
      >
        {!isOutgoing && !isVoiceOnly && (
          <p className="mb-1 text-xs font-semibold text-[var(--wa-accent)]">{message.sender}</p>
        )}

        <MediaAttachment
          message={message}
          exportData={exportData}
          timestamp={shortTimestamp}
          onOpenMedia={onOpenMedia}
        />

        {message.text && <MessageText text={message.text} />}

        {!isVoiceOnly && (
          <div className="mt-1 flex items-end justify-end gap-1.5">
            {message.edited && (
              <span className="text-[11px] leading-none text-[var(--wa-muted)]">bearbeitet</span>
            )}
            <span className="text-[11px] leading-none text-[var(--wa-muted)]">{timestamp}</span>
          </div>
        )}
      </div>
    </article>
  );
}

interface MediaGroupBubbleProps {
  sender: string;
  date: Date;
  items: MediaGalleryItem[];
  exportData: WhatsAppExport;
  isOutgoing: boolean;
  onOpenMedia: (items: MediaGalleryItem[], index: number) => void;
}

export function MediaGroupBubble({
  sender,
  date,
  items,
  exportData,
  isOutgoing,
  onOpenMedia,
}: MediaGroupBubbleProps) {
  const timestamp = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return (
    <article className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(100%,680px)] rounded-2xl px-3 py-2 shadow-sm ${
          isOutgoing
            ? "rounded-br-md bg-[var(--wa-outgoing)]"
            : "rounded-bl-md bg-[var(--wa-incoming)]"
        }`}
      >
        {!isOutgoing && (
          <p className="mb-1 text-xs font-semibold text-[var(--wa-accent)]">{sender}</p>
        )}

        <MediaGrid
          items={items}
          exportData={exportData}
          onOpen={(index) => onOpenMedia(items, index)}
        />

        <p className="mt-1 text-right text-[11px] text-[var(--wa-muted)]">{timestamp}</p>
      </div>
    </article>
  );
}
