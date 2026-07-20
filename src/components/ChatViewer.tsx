"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatTimeline } from "@/components/ChatTimeline";
import { MediaLightbox } from "@/components/MediaLightbox";
import { MediaGroupBubble, MessageBubble } from "@/components/MessageBubble";
import { buildChatTimeline, findTimelineDayFromScroll } from "@/lib/chat-timeline";
import { buildDisplayItems } from "@/lib/media-groups";
import type { MediaGalleryItem } from "@/lib/media-groups";
import type { ChatViewOptions, WhatsAppExport } from "@/types/whatsapp";

interface ChatViewerProps {
  exportData: WhatsAppExport;
  options: ChatViewOptions;
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function ChatViewer({ exportData, options }: ChatViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const [activeDayKey, setActiveDayKey] = useState<string>();
  const [lightbox, setLightbox] = useState<{
    items: MediaGalleryItem[];
    index: number;
  } | null>(null);

  const filteredMessages = useMemo(() => {
    const query = options.searchQuery.trim().toLowerCase();
    if (!query) return exportData.messages;

    return exportData.messages.filter((message) => {
      const haystack = [
        message.sender,
        message.text,
        message.attachment?.filename ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [exportData.messages, options.searchQuery]);

  const displayItems = useMemo(
    () => buildDisplayItems(filteredMessages),
    [filteredMessages],
  );

  const daySections = useMemo(() => {
    const groups: Array<{ key: string; label: string; messages: typeof filteredMessages }> =
      [];

    for (const message of filteredMessages) {
      const key = dayKey(message.date);
      const lastGroup = groups.at(-1);

      if (!lastGroup || lastGroup.key !== key) {
        groups.push({
          key,
          label: formatDayLabel(message.date),
          messages: [message],
        });
      } else {
        lastGroup.messages.push(message);
      }
    }

    return groups;
  }, [filteredMessages]);

  const renderedGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: typeof displayItems }> = [];

    for (const item of displayItems) {
      const date = item.kind === "message" ? item.message.date : item.date;
      const key = dayKey(date);
      const lastGroup = groups.at(-1);

      if (!lastGroup || lastGroup.key !== key) {
        groups.push({
          key,
          label: formatDayLabel(date),
          items: [item],
        });
      } else {
        lastGroup.items.push(item);
      }
    }

    return groups;
  }, [displayItems]);

  const timeline = useMemo(() => buildChatTimeline(daySections), [daySections]);

  const openMedia = useCallback((items: MediaGalleryItem[], index: number) => {
    setLightbox({ items, index });
  }, []);

  const scrollToDay = useCallback((key: string) => {
    const section = sectionRefs.current.get(key);
    const container = scrollRef.current;

    if (!section || !container) return;

    const top =
      section.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      12;

    container.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
    setActiveDayKey(key);
  }, []);

  useEffect(() => {
    sectionRefs.current.clear();
  }, [renderedGroups]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || timeline.days.length === 0) return;

    function syncActiveDay() {
      const day = findTimelineDayFromScroll(
        timeline.days,
        container!.scrollTop,
        container!.scrollHeight,
        container!.clientHeight,
      );
      if (day) setActiveDayKey(day.key);
    }

    syncActiveDay();
    container.addEventListener("scroll", syncActiveDay, { passive: true });
    return () => container.removeEventListener("scroll", syncActiveDay);
  }, [timeline.days]);

  useEffect(() => {
    if (daySections[0]) {
      setActiveDayKey(daySections[0].key);
    }
  }, [daySections]);

  if (filteredMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl bg-white/70 p-10 text-center text-[var(--wa-muted)]">
        Keine Nachrichten für diese Suche gefunden.
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-[70vh] flex-1 overflow-hidden rounded-2xl bg-[var(--wa-chat-bg)]/90 shadow-inner">
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pr-2"
        >
          {renderedGroups.map((group) => (
            <section
              key={group.key}
              ref={(element) => {
                if (element) sectionRefs.current.set(group.key, element);
                else sectionRefs.current.delete(group.key);
              }}
              data-day-key={group.key}
              className="space-y-3"
            >
              <div className="sticky top-0 z-10 flex justify-center">
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[var(--wa-muted)] shadow-sm">
                  {group.label}
                </span>
              </div>

              {group.items.map((item) =>
                item.kind === "media-group" ? (
                  <MediaGroupBubble
                    key={item.id}
                    sender={item.sender}
                    date={item.date}
                    items={item.items}
                    exportData={exportData}
                    isOutgoing={item.sender === options.myName}
                    onOpenMedia={openMedia}
                  />
                ) : (
                  <MessageBubble
                    key={item.message.id}
                    message={item.message}
                    exportData={exportData}
                    isOutgoing={item.message.sender === options.myName}
                    onOpenMedia={openMedia}
                  />
                ),
              )}
            </section>
          ))}
        </div>

        <ChatTimeline
          model={timeline}
          activeDayKey={activeDayKey}
          onSelectDay={(day) => scrollToDay(day.key)}
        />
      </div>

      {lightbox && (
        <MediaLightbox
          items={lightbox.items}
          index={lightbox.index}
          exportData={exportData}
          onClose={() => setLightbox(null)}
          onChangeIndex={(index) =>
            setLightbox((current) => (current ? { ...current, index } : current))
          }
        />
      )}
    </>
  );
}
