"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChatTimeline, type ChatTimelineHandle } from "@/components/ChatTimeline";
import { MobileTimelineScrubber, type MobileTimelineScrubberHandle } from "@/components/MobileTimelineScrubber";
import { MediaLightbox } from "@/components/MediaLightbox";
import { MediaGroupBubble, MessageBubble } from "@/components/MessageBubble";
import { DEFAULT_DAY_RADIUS, dayKeyFromDate } from "@/lib/chat-day";
import { buildChatTimeline, type TimelineDay } from "@/lib/chat-timeline";
import {
  buildVirtualRows,
  findRowIndexForDay,
  findRowIndexForMessage,
  type VirtualChatRow,
} from "@/lib/chat-view-rows";
import {
  loadChatMessageRange,
  searchChatMessages,
  type ChatIndexResponse,
} from "@/lib/load-local-chat";
import type { MediaGalleryItem } from "@/lib/media-groups";
import type { ChatMessage, WhatsAppExport } from "@/types/whatsapp";

interface ChatViewerProps {
  chatIndex: ChatIndexResponse;
  exportData: WhatsAppExport;
  myName: string;
  searchQuery: string;
}

type PendingScroll = {
  dayKey?: string;
  messageId?: string;
  align?: "start" | "center" | "end";
};

const SIZE_BUFFER = 12;
const SCROLL_IDLE_MS = 220;
const EXTEND_EDGE_PX = 480;
const HANDLE_HIDE_MS = 1800;

export function ChatViewer({ chatIndex, exportData, myName, searchQuery }: ChatViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const windowLoadingRef = useRef(false);
  const extendLoadingRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const extendTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollReadyRef = useRef(false);
  const overlayHideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const windowRangeRef = useRef({ start: 0, end: 0 });
  const pendingScrollRef = useRef<PendingScroll | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeDayRef = useRef<string | undefined>(undefined);
  const sidebarTimelineRef = useRef<ChatTimelineHandle>(null);
  const mobileScrubberRef = useRef<MobileTimelineScrubberHandle>(null);
  const isMobileRef = useRef(false);
  const scrubbingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeDayKey, setActiveDayKey] = useState<string>();
  const [loadingWindow, setLoadingWindow] = useState(true);
  const [searchResults, setSearchResults] = useState<VirtualChatRow[]>([]);
  const [searchActive, setSearchActive] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string>();
  const [lightbox, setLightbox] = useState<{
    items: MediaGalleryItem[];
    index: number;
  } | null>(null);

  const estimateRowSize = useCallback(
    (row: VirtualChatRow | undefined): number => {
      if (!row) return 92 + SIZE_BUFFER;

      const ROW_GAP = 12;
      if (row.kind === "day-header") return 48 + ROW_GAP + SIZE_BUFFER;
      if (row.kind === "search-result") return 96 + ROW_GAP + SIZE_BUFFER;

      if (row.kind === "display-item") {
        if (row.item.kind === "media-group") {
          const count = row.item.items.length;
          const header = row.item.sender === myName ? 0 : 24;
          const footer = 24;
          const bubble = 16;
          if (count === 1) return header + 256 + footer + bubble + ROW_GAP + SIZE_BUFFER;
          if (count === 2) return header + 170 + footer + bubble + ROW_GAP + SIZE_BUFFER;
          return header + 330 + footer + bubble + ROW_GAP + SIZE_BUFFER;
        }

        const message = row.item.message;
        const attachment = message.attachment;
        const header = message.sender === myName ? 0 : 24;
        const footer = 24;
        const bubble = 16;

        if (attachment?.kind === "image" || attachment?.kind === "video" || attachment?.kind === "sticker") {
          return header + 256 + footer + bubble + ROW_GAP + SIZE_BUFFER;
        }
        if (attachment?.kind === "audio") {
          return header + 88 + footer + bubble + ROW_GAP + SIZE_BUFFER;
        }

        const lineCount = Math.max(1, Math.ceil(message.text.length / 34));
        return header + 24 + lineCount * 24 + footer + bubble + ROW_GAP + SIZE_BUFFER;
      }

      return 92 + SIZE_BUFFER;
    },
    [myName],
  );

  const daySections = useMemo(
    () =>
      chatIndex.days.map((day) => ({
        key: day.key,
        label: day.date,
        messages: [{ date: new Date(day.date) }],
      })),
    [chatIndex.days],
  );

  const timeline = useMemo(() => buildChatTimeline(daySections), [daySections]);

  const timelineDayByKey = useMemo(() => {
    const map = new Map<string, TimelineDay>();
    for (const day of timeline.days) {
      map.set(day.key, day);
    }
    return map;
  }, [timeline.days]);

  const rows = useMemo(
    () => (searchActive ? searchResults : buildVirtualRows(messages)),
    [messages, searchActive, searchResults],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRowSize(rows[index]),
    overscan: 8,
  });

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const container = scrollRef.current;
    if (!anchor || !container) return;

    scrollAnchorRef.current = null;
    container.scrollTop = anchor.top + (container.scrollHeight - anchor.height);
  }, [messages]);

  const previewTimelineDay = useCallback(
    (dayKey?: string) => {
      if (!dayKey) return;
      const day = timelineDayByKey.get(dayKey);
      if (!day) return;

      sidebarTimelineRef.current?.previewDay(day);
      if (isMobileRef.current) {
        mobileScrubberRef.current?.setActiveDay(dayKey);
      }
    },
    [timelineDayByKey],
  );

  const resolveActiveDayFromScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || rows.length === 0) return undefined;

    const anchor = container.scrollTop + container.clientHeight * 0.22;
    const virtualItems = rowVirtualizer.getVirtualItems();
    let nextDayKey: string | undefined;

    for (const item of virtualItems) {
      if (item.start <= anchor && item.end > anchor) {
        nextDayKey = rows[item.index]?.dayKey;
        break;
      }
    }

    if (!nextDayKey) {
      nextDayKey = rows[virtualItems[0]?.index ?? 0]?.dayKey;
    }

    return nextDayKey;
  }, [rowVirtualizer, rows]);

  const scheduleHandleHide = useCallback(() => {
    clearTimeout(overlayHideTimerRef.current);
    overlayHideTimerRef.current = setTimeout(() => {
      if (scrubbingRef.current) return;
      mobileScrubberRef.current?.hideHandle();
    }, HANDLE_HIDE_MS);
  }, []);

  const getScrollEdges = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return null;

    const distanceTop = container.scrollTop;
    const distanceBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    return {
      nearTop: distanceTop < EXTEND_EDGE_PX,
      nearBottom: distanceBottom < EXTEND_EDGE_PX,
      distanceTop,
      distanceBottom,
    };
  }, []);

  const loadRangeByIndices = useCallback(
    async (
      startIndex: number,
      endIndex: number,
      options?: { scrollTarget?: PendingScroll; preserveScroll?: boolean },
    ) => {
      const fromDay = chatIndex.days[startIndex]?.key;
      const toDay = chatIndex.days[endIndex]?.key;
      if (!fromDay || !toDay) return;

      const generation = ++loadGenerationRef.current;
      windowLoadingRef.current = true;
      scrollReadyRef.current = false;

      if (!options?.preserveScroll) {
        setLoadingWindow(true);
      }

      try {
        const response = await loadChatMessageRange(chatIndex.slug, fromDay, toDay);
        if (generation !== loadGenerationRef.current) return;

        const nextMessages = response.messages.map((message) => ({
          ...message,
          date: new Date(message.date),
        }));

        windowRangeRef.current = { start: startIndex, end: endIndex };
        setMessages(nextMessages);

        if (options?.scrollTarget) {
          pendingScrollRef.current = options.scrollTarget;
          activeDayRef.current = options.scrollTarget.dayKey;
          setActiveDayKey(options.scrollTarget.dayKey);
          previewTimelineDay(options.scrollTarget.dayKey);
        } else if (!options?.preserveScroll) {
          const fallbackDay = response.dayKeys.at(-1);
          pendingScrollRef.current = { dayKey: fallbackDay, align: "end" };
          activeDayRef.current = fallbackDay;
          setActiveDayKey(fallbackDay);
          previewTimelineDay(fallbackDay);
        }
      } catch (error) {
        if (generation !== loadGenerationRef.current) return;
        console.error("Nachrichtenfenster konnte nicht geladen werden.", error);
      } finally {
        if (generation === loadGenerationRef.current) {
          windowLoadingRef.current = false;
          if (!options?.preserveScroll) {
            setLoadingWindow(false);
          }
        }
      }
    },
    [chatIndex.days, chatIndex.slug, previewTimelineDay],
  );

  const jumpToDay = useCallback(
    (dayKey: string) => {
      const dayIndex = chatIndex.days.findIndex((day) => day.key === dayKey);
      if (dayIndex === -1) return;

      setSearchActive(false);
      setSearchResults([]);
      setHighlightMessageId(undefined);

      const startIndex = Math.max(0, dayIndex - DEFAULT_DAY_RADIUS);
      const endIndex = Math.min(chatIndex.days.length - 1, dayIndex + DEFAULT_DAY_RADIUS);

      void loadRangeByIndices(startIndex, endIndex, { scrollTarget: { dayKey } });
    },
    [chatIndex.days, loadRangeByIndices],
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncMobile = () => {
      isMobileRef.current = media.matches;
    };

    syncMobile();
    media.addEventListener("change", syncMobile);
    return () => media.removeEventListener("change", syncMobile);
  }, []);

  useEffect(() => {
    const lastIndex = chatIndex.days.length - 1;
    if (lastIndex < 0) return;

    const startIndex = Math.max(0, lastIndex - DEFAULT_DAY_RADIUS);
    void loadRangeByIndices(startIndex, lastIndex, {
      scrollTarget: { dayKey: chatIndex.days[lastIndex]?.key, align: "end" },
    });
  }, [chatIndex.days, loadRangeByIndices]);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      const normalized = searchQuery.trim();
      if (!normalized) {
        setSearchActive(false);
        setSearchResults([]);
        return;
      }

      const response = await searchChatMessages(chatIndex.slug, normalized);
      setSearchActive(true);
      setSearchResults(
        response.results.map((result) => ({
          kind: "search-result" as const,
          id: result.id,
          messageId: result.id,
          dayKey: dayKeyFromDate(new Date(result.date)),
          sender: result.sender,
          text: result.text,
          date: new Date(result.date),
          attachment: result.attachment,
        })),
      );
    }, 250);

    return () => clearTimeout(searchTimerRef.current);
  }, [chatIndex.slug, searchQuery]);

  useLayoutEffect(() => {
    if (!pendingScrollRef.current || rows.length === 0) return;

    const target = pendingScrollRef.current;
    pendingScrollRef.current = null;
    const container = scrollRef.current;

    if (target.align === "end" && !target.messageId && container) {
      rowVirtualizer.scrollToIndex(rows.length - 1, { align: "end", behavior: "auto" });
      scrollReadyRef.current = true;
      return;
    }

    const rowIndex = target.messageId
      ? findRowIndexForMessage(rows, target.messageId)
      : target.dayKey
        ? findRowIndexForDay(rows, target.dayKey)
        : -1;

    if (rowIndex >= 0) {
      rowVirtualizer.scrollToIndex(rowIndex, {
        align: target.messageId ? "center" : (target.align ?? "start"),
        behavior: "auto",
      });
      scrollReadyRef.current = true;
      return;
    }

    if (container) {
      container.scrollTop = 0;
    }
    scrollReadyRef.current = true;
  }, [messages, rowVirtualizer, rows]);

  const extendWindowEdge = useCallback(
    async (direction: "prev" | "next"): Promise<boolean> => {
      if (windowLoadingRef.current || extendLoadingRef.current || searchActive) return false;

      const container = scrollRef.current;
      const { start, end } = windowRangeRef.current;

      if (direction === "prev" && start > 0) {
        const nextStart = Math.max(0, start - DEFAULT_DAY_RADIUS);
        const fromDay = chatIndex.days[nextStart]?.key;
        const toDay = chatIndex.days[start - 1]?.key;
        if (!fromDay || !toDay || nextStart === start) return false;

        extendLoadingRef.current = true;

        if (container) {
          scrollAnchorRef.current = {
            height: container.scrollHeight,
            top: container.scrollTop,
          };
        }

        try {
          const response = await loadChatMessageRange(chatIndex.slug, fromDay, toDay);
          const incoming = response.messages.map((message) => ({
            ...message,
            date: new Date(message.date),
          }));

          windowRangeRef.current = { start: nextStart, end };

          startTransition(() => {
            setMessages((current) => {
              const knownIds = new Set(current.map((message) => message.id));
              const prepended = incoming.filter((message) => !knownIds.has(message.id));
              if (prepended.length === 0) return current;
              return [...prepended, ...current];
            });
          });

          return true;
        } catch (error) {
          console.error("Ältere Nachrichten konnten nicht geladen werden.", error);
          return false;
        } finally {
          extendLoadingRef.current = false;
        }
      }

      if (direction === "next" && end < chatIndex.days.length - 1) {
        const nextEnd = Math.min(chatIndex.days.length - 1, end + DEFAULT_DAY_RADIUS);
        const fromDay = chatIndex.days[end + 1]?.key;
        const toDay = chatIndex.days[nextEnd]?.key;
        if (!fromDay || !toDay || nextEnd === end) return false;

        extendLoadingRef.current = true;

        try {
          const response = await loadChatMessageRange(chatIndex.slug, fromDay, toDay);
          const incoming = response.messages.map((message) => ({
            ...message,
            date: new Date(message.date),
          }));

          windowRangeRef.current = { start, end: nextEnd };

          startTransition(() => {
            setMessages((current) => {
              const knownIds = new Set(current.map((message) => message.id));
              const appended = incoming.filter((message) => !knownIds.has(message.id));
              if (appended.length === 0) return current;
              return [...current, ...appended];
            });
          });

          return true;
        } catch (error) {
          console.error("Neuere Nachrichten konnten nicht geladen werden.", error);
          return false;
        } finally {
          extendLoadingRef.current = false;
        }
      }

      return false;
    },
    [chatIndex.days, chatIndex.slug, searchActive],
  );

  const maybeExtendWindow = useCallback(async () => {
    if (
      !scrollReadyRef.current ||
      pendingScrollRef.current ||
      windowLoadingRef.current ||
      extendLoadingRef.current ||
      searchActive
    ) {
      return false;
    }

    const edges = getScrollEdges();
    if (!edges) return false;

    const { start, end } = windowRangeRef.current;

    if (edges.nearTop && start > 0) {
      return extendWindowEdge("prev");
    }

    if (edges.nearBottom && end < chatIndex.days.length - 1) {
      return extendWindowEdge("next");
    }

    return false;
  }, [chatIndex.days.length, extendWindowEdge, getScrollEdges, searchActive]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || searchActive) return;

    lastScrollTopRef.current = container.scrollTop;
    lastScrollTimeRef.current = performance.now();

    const onScroll = () => {
      lastScrollTopRef.current = container.scrollTop;
      lastScrollTimeRef.current = performance.now();

      const nextDayKey = resolveActiveDayFromScroll();
      if (nextDayKey) {
        activeDayRef.current = nextDayKey;
        previewTimelineDay(nextDayKey);
      }

      if (isMobileRef.current && !scrubbingRef.current) {
        mobileScrubberRef.current?.showHandle();
        scheduleHandleHide();
      }

      clearTimeout(extendTimerRef.current);
      extendTimerRef.current = setTimeout(() => {
        if (activeDayRef.current) {
          setActiveDayKey(activeDayRef.current);
        }
        void maybeExtendWindow();
      }, SCROLL_IDLE_MS);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearTimeout(extendTimerRef.current);
      clearTimeout(overlayHideTimerRef.current);
    };
  }, [maybeExtendWindow, previewTimelineDay, resolveActiveDayFromScroll, scheduleHandleHide, searchActive]);

  const openMedia = useCallback((items: MediaGalleryItem[], index: number) => {
    setLightbox({ items, index });
  }, []);

  const openSearchResult = useCallback(
    async (row: Extract<VirtualChatRow, { kind: "search-result" }>) => {
      setSearchActive(false);
      setSearchResults([]);
      setHighlightMessageId(row.messageId);

      const dayIndex = chatIndex.days.findIndex((day) => day.key === row.dayKey);
      if (dayIndex === -1) return;

      const startIndex = Math.max(0, dayIndex - DEFAULT_DAY_RADIUS);
      const endIndex = Math.min(chatIndex.days.length - 1, dayIndex + DEFAULT_DAY_RADIUS);

      await loadRangeByIndices(startIndex, endIndex, {
        scrollTarget: {
          dayKey: row.dayKey,
          messageId: row.messageId,
        },
      });
    },
    [chatIndex.days, loadRangeByIndices],
  );

  if (searchActive && searchResults.length === 0 && searchQuery.trim()) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-[var(--wa-chat-bg)]/90 p-10 text-center text-[var(--wa-muted)]">
        Keine Nachrichten für diese Suche gefunden.
      </div>
    );
  }

  if (!searchActive && messages.length === 0 && !loadingWindow) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-[var(--wa-chat-bg)]/90 p-10 text-center text-[var(--wa-muted)]">
        Keine Nachrichten in diesem Chat.
      </div>
    );
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-[var(--wa-chat-bg)]/90 shadow-inner">
        <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto p-4 pr-2">
          {loadingWindow && (
            <div className="mb-3 text-center text-xs text-[var(--wa-muted)]">Nachrichten werden geladen…</div>
          )}

          <VirtualChatRows
            rowVirtualizer={rowVirtualizer}
            rows={rows}
            exportData={exportData}
            myName={myName}
            highlightMessageId={highlightMessageId}
            onOpenMedia={openMedia}
            onOpenSearchResult={openSearchResult}
          />
        </div>

        {!searchActive && (
          <>
            <ChatTimeline
              ref={sidebarTimelineRef}
              model={timeline}
              activeDayKey={activeDayKey}
              onPreviewDay={(day) => {
                activeDayRef.current = day.key;
                previewTimelineDay(day.key);
              }}
              onSelectDay={(day) => jumpToDay(day.key)}
            />

            <MobileTimelineScrubber
              ref={mobileScrubberRef}
              model={timeline}
              activeDayKey={activeDayKey}
              onScrubbingChange={(scrubbing) => {
                scrubbingRef.current = scrubbing;
                if (scrubbing) {
                  clearTimeout(overlayHideTimerRef.current);
                } else {
                  scheduleHandleHide();
                }
              }}
              onPreviewDay={(day) => {
                activeDayRef.current = day.key;
              }}
              onSelectDay={(day) => jumpToDay(day.key)}
            />
          </>
        )}
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

interface VirtualChatRowsProps {
  rowVirtualizer: {
    getTotalSize: () => number;
    getVirtualItems: () => Array<{
      index: number;
      start: number;
      size: number;
    }>;
  };
  rows: VirtualChatRow[];
  exportData: WhatsAppExport;
  myName: string;
  highlightMessageId?: string;
  onOpenMedia: (items: MediaGalleryItem[], index: number) => void;
  onOpenSearchResult: (row: Extract<VirtualChatRow, { kind: "search-result" }>) => void;
}

const VirtualChatRows = function VirtualChatRows({
  rowVirtualizer,
  rows,
  exportData,
  myName,
  highlightMessageId,
  onOpenMedia,
  onOpenSearchResult,
}: VirtualChatRowsProps) {
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
      {virtualItems.map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;

        return (
          <div
            key={row.id}
            className="virtual-chat-row absolute left-0 top-0 w-full pb-3"
            style={{
              minHeight: `${virtualRow.size}px`,
              transform: `translate3d(0, ${virtualRow.start}px, 0)`,
            }}
          >
            {row.kind === "day-header" && (
              <div className="flex justify-center pb-1">
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[var(--wa-muted)] shadow-sm">
                  {row.label}
                </span>
              </div>
            )}

            {row.kind === "display-item" &&
              (row.item.kind === "media-group" ? (
                <MediaGroupBubble
                  sender={row.item.sender}
                  date={row.item.date}
                  items={row.item.items}
                  exportData={exportData}
                  isOutgoing={row.item.sender === myName}
                  onOpenMedia={onOpenMedia}
                />
              ) : (
                <div
                  className={
                    highlightMessageId === row.item.message.id
                      ? "rounded-2xl ring-2 ring-[var(--wa-accent)]/40"
                      : undefined
                  }
                >
                  <MessageBubble
                    message={row.item.message}
                    exportData={exportData}
                    isOutgoing={row.item.message.sender === myName}
                    onOpenMedia={onOpenMedia}
                  />
                </div>
              ))}

            {row.kind === "search-result" && (
              <button
                type="button"
                onClick={() => void onOpenSearchResult(row)}
                className="w-full rounded-2xl bg-white/90 px-4 py-3 text-left shadow-sm transition hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[var(--wa-accent)]">{row.sender}</span>
                  <span className="text-[11px] text-[var(--wa-muted)]">
                    {new Intl.DateTimeFormat("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(row.date)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--wa-text)]">
                  {row.text || row.attachment || "Medien"}
                </p>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
