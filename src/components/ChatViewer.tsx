"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
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
import { isVoiceMessage } from "@/lib/media-types";
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

const SIZE_BUFFER = 6;
/** Uniform visual gap between every chat row (virtualizer `gap`). */
const ROW_GAP_PX = 10;
const TEXT_LINE_HEIGHT = 22;
/** ~bubble content width; slight over-estimate is OK, sticky oversize is not. */
const TEXT_CHARS_PER_LINE = 40;
/** Outgoing voice bubble is compact (no sender line / no extra footer). */
const VOICE_ROW_HEIGHT = 64;
const SCROLL_IDLE_MS = 220;
const EXTEND_EDGE_PX = 480;
const HANDLE_HIDE_MS = 1800;
const JUMP_LOCK_MS = 750;

/** Count wrapped lines including explicit newlines (WhatsApp multi-line messages). */
function estimateTextLines(text: string): number {
  const normalized = text.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized) return 1;

  let lines = 0;
  for (const paragraph of normalized.split("\n")) {
    // Long URLs / unbroken tokens wrap less efficiently than plain prose.
    const tokenPenalty = paragraph.split(/\s+/).reduce((extra, token) => {
      if (token.length <= TEXT_CHARS_PER_LINE) return extra;
      return extra + Math.ceil(token.length / TEXT_CHARS_PER_LINE) - 1;
    }, 0);
    lines += Math.max(1, Math.ceil(paragraph.length / TEXT_CHARS_PER_LINE) + tokenPenalty);
  }
  return lines;
}

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
  const jumpLockUntilRef = useRef(0);
  const hasInitializedRef = useRef(false);
  const sidebarTimelineRef = useRef<ChatTimelineHandle>(null);
  const mobileScrubberRef = useRef<MobileTimelineScrubberHandle>(null);
  const isMobileRef = useRef(false);
  const scrubbingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  /** Skip ResizeObserver→resize cascades while the user is actively scrolling or a prepend is settling. */
  const freezeRowMeasureRef = useRef(false);
  const lastPreviewDayKeyRef = useRef<string | undefined>(undefined);

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
      if (!row) return 72 + SIZE_BUFFER;

      if (row.kind === "day-header") return 36 + SIZE_BUFFER;
      if (row.kind === "search-result") return 84 + SIZE_BUFFER;

      if (row.kind === "display-item") {
        if (row.item.kind === "media-group") {
          const count = row.item.items.length;
          const header = row.item.sender === myName ? 0 : 22;
          const footer = 20;
          const bubble = 16;
          const captionHeight = row.item.caption
            ? estimateTextLines(row.item.caption) * TEXT_LINE_HEIGHT
            : 0;

          // Empty group (shouldn't happen) — treat like a short text row.
          if (count === 0) {
            return header + TEXT_LINE_HEIGHT + footer + bubble + SIZE_BUFFER;
          }
          if (count === 1) return header + 256 + captionHeight + footer + bubble + SIZE_BUFFER;
          // 2-image albums often stack (two landscapes) — reserve taller than a side-by-side pair.
          if (count === 2) return header + 360 + captionHeight + footer + bubble + SIZE_BUFFER;
          if (count === 3) return header + 320 + captionHeight + footer + bubble + SIZE_BUFFER;
          return header + 330 + captionHeight + footer + bubble + SIZE_BUFFER;
        }

        const message = row.item.message;
        const attachment = message.attachment;
        const header = message.sender === myName ? 0 : 22;
        const footer = 20;
        const bubble = 16;

        // Omitted / missing media render as a single italic line — never reserve image height.
        if (attachment && (attachment.omitted || !attachment.filename)) {
          const textLines = message.text.trim() ? estimateTextLines(message.text) : 1;
          return header + bubble + textLines * TEXT_LINE_HEIGHT + footer + SIZE_BUFFER;
        }

        if (attachment?.kind === "image" || attachment?.kind === "video" || attachment?.kind === "sticker") {
          const captionHeight = message.text.trim()
            ? estimateTextLines(message.text) * TEXT_LINE_HEIGHT
            : 0;
          return header + 256 + captionHeight + footer + bubble + SIZE_BUFFER;
        }
        if (attachment?.kind === "audio") {
          // VoiceMessagePlayer includes its own timestamp; MessageBubble skips the footer.
          if (attachment.filename && isVoiceMessage(attachment.filename) && !message.text.trim()) {
            return header + VOICE_ROW_HEIGHT + SIZE_BUFFER;
          }
          return header + 88 + footer + bubble + SIZE_BUFFER;
        }

        const lineCount = estimateTextLines(message.text);
        return header + bubble + lineCount * TEXT_LINE_HEIGHT + footer + SIZE_BUFFER;
      }

      return 72 + SIZE_BUFFER;
    },
    [myName],
  );

  const daySections = useMemo(
    () =>
      chatIndex.days.map((day) => ({
        key: day.key,
        label: day.date,
        messages: [{ date: new Date(day.date) }],
        messageCount: day.messageCount,
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
    overscan: 12,
    gap: ROW_GAP_PX,
    getItemKey: (index) => rows[index]?.id ?? index,
    useScrollendEvent: true,
    isScrollingResetDelay: 150,
    // Always prefer the real DOM height. Sticky Math.max(estimate, measured) left
    // oversized slots (uneven gaps) after voice/text rows. Only during prepend
    // settle do we avoid shrinking below the current cache for a few frames.
    measureElement: (element, _entry, instance) => {
      const measured = Math.round((element as HTMLElement).offsetHeight);
      if (!Number.isFinite(measured) || measured <= 0) {
        const index = instance.indexFromElement(element);
        return instance.options.estimateSize(index);
      }

      if (freezeRowMeasureRef.current) {
        const index = instance.indexFromElement(element);
        const key = instance.options.getItemKey(index);
        const cached = instance.itemSizeCache.get(key);
        if (cached !== undefined) return Math.max(cached, measured);
      }

      return measured;
    },
  });

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const container = scrollRef.current;
    if (!anchor || !container) return;

    scrollAnchorRef.current = null;
    container.scrollTop = anchor.top + (container.scrollHeight - anchor.height);
    // Freeze only briefly so RO cannot fight the anchor — then remeasure.
    // Must not wait for another scroll event (prepend often happens on scroll-idle).
    freezeRowMeasureRef.current = true;
    const unfreezeTimer = window.setTimeout(() => {
      freezeRowMeasureRef.current = false;
      rowVirtualizer.measure();
    }, 120);
    return () => window.clearTimeout(unfreezeTimer);
  }, [messages, rowVirtualizer]);

  const previewTimelineDay = useCallback(
    (dayKey?: string) => {
      if (!dayKey || dayKey === lastPreviewDayKeyRef.current) return;
      lastPreviewDayKeyRef.current = dayKey;
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
          lastPreviewDayKeyRef.current = undefined;
          setActiveDayKey(options.scrollTarget.dayKey);
          previewTimelineDay(options.scrollTarget.dayKey);
        } else if (!options?.preserveScroll) {
          const fallbackDay = response.dayKeys.at(-1);
          pendingScrollRef.current = { dayKey: fallbackDay, align: "end" };
          activeDayRef.current = fallbackDay;
          lastPreviewDayKeyRef.current = undefined;
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
      if (dayIndex === -1) {
        console.warn("Timeline-Sprung: Tag nicht im Index", dayKey);
        return;
      }

      setSearchActive(false);
      setSearchResults([]);
      setHighlightMessageId(undefined);

      // Pin timeline + scroll-sync to the clicked day while the jump settles.
      jumpLockUntilRef.current = performance.now() + JUMP_LOCK_MS;
      activeDayRef.current = dayKey;
      lastPreviewDayKeyRef.current = undefined;
      setActiveDayKey(dayKey);
      previewTimelineDay(dayKey);

      const startIndex = Math.max(0, dayIndex - DEFAULT_DAY_RADIUS);
      const endIndex = Math.min(chatIndex.days.length - 1, dayIndex + DEFAULT_DAY_RADIUS);

      void loadRangeByIndices(startIndex, endIndex, {
        scrollTarget: { dayKey, align: "start" },
      });
    },
    [chatIndex.days, loadRangeByIndices, previewTimelineDay],
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
    hasInitializedRef.current = false;
  }, [chatIndex.slug]);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    const lastIndex = chatIndex.days.length - 1;
    if (lastIndex < 0) return;

    hasInitializedRef.current = true;
    const startIndex = Math.max(0, lastIndex - DEFAULT_DAY_RADIUS);
    void loadRangeByIndices(startIndex, lastIndex, {
      scrollTarget: { dayKey: chatIndex.days[lastIndex]?.key, align: "end" },
    });
    // Only once per chat — must not re-fire when loadRangeByIndices identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIndex.slug, chatIndex.days]);

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

    const scrollToTarget = () => {
      if (target.align === "end" && !target.messageId && !target.dayKey) {
        rowVirtualizer.scrollToIndex(rows.length - 1, { align: "end", behavior: "auto" });
        return true;
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
        return true;
      }

      return false;
    };

    const scrolled = scrollToTarget();
    if (!scrolled && container && target.dayKey) {
      // Target day missing from rows — stay put rather than jumping to scrollTop 0
      // of an unrelated window. Retry once after the virtualizer measures.
      requestAnimationFrame(() => {
        if (!scrollToTarget() && container && target.align === "end") {
          rowVirtualizer.scrollToIndex(rows.length - 1, { align: "end", behavior: "auto" });
        }
      });
    } else if (!scrolled && container && target.align === "end") {
      rowVirtualizer.scrollToIndex(rows.length - 1, { align: "end", behavior: "auto" });
    } else if (scrolled) {
      // Re-apply after measure so estimate→actual size shifts don't leave us on the wrong day.
      requestAnimationFrame(() => {
        scrollToTarget();
        requestAnimationFrame(() => scrollToTarget());
      });
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
        freezeRowMeasureRef.current = true;

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

          // Sync update (not startTransition): layout-effect scroll anchoring must run
          // in the same commit as the prepend, otherwise mid-scroll prepends jerk.
          setMessages((current) => {
            const knownIds = new Set(current.map((message) => message.id));
            const prepended = incoming.filter((message) => !knownIds.has(message.id));
            if (prepended.length === 0) return current;
            return [...prepended, ...current];
          });

          return true;
        } catch (error) {
          console.error("Ältere Nachrichten konnten nicht geladen werden.", error);
          freezeRowMeasureRef.current = false;
          scrollAnchorRef.current = null;
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

          setMessages((current) => {
            const knownIds = new Set(current.map((message) => message.id));
            const appended = incoming.filter((message) => !knownIds.has(message.id));
            if (appended.length === 0) return current;
            return [...current, ...appended];
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

      const jumpLocked = performance.now() < jumpLockUntilRef.current;

      if (!jumpLocked) {
        const nextDayKey = resolveActiveDayFromScroll();
        if (nextDayKey) {
          activeDayRef.current = nextDayKey;
          previewTimelineDay(nextDayKey);
        }
      } else if (activeDayRef.current) {
        // Keep the clicked day visible on the timeline while the jump settles.
        previewTimelineDay(activeDayRef.current);
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

        // After scroll settles: allow real measurements once, then optionally extend.
        freezeRowMeasureRef.current = false;
        rowVirtualizer.measure();

        if (performance.now() >= jumpLockUntilRef.current) {
          void maybeExtendWindow();
        }
      }, SCROLL_IDLE_MS);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearTimeout(extendTimerRef.current);
      clearTimeout(overlayHideTimerRef.current);
    };
  }, [
    maybeExtendWindow,
    previewTimelineDay,
    resolveActiveDayFromScroll,
    rowVirtualizer,
    scheduleHandleHide,
    searchActive,
  ]);

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
        <div ref={scrollRef} className="chat-scroll relative min-h-0 flex-1 overflow-y-auto p-4 pr-2">
          {loadingWindow && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center text-xs text-[var(--wa-muted)]">
              Nachrichten werden geladen…
            </div>
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
    measureElement: (node: Element | null) => void;
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
            ref={rowVirtualizer.measureElement}
            data-index={virtualRow.index}
            className="virtual-chat-row absolute left-0 top-0 w-full"
            style={{
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
                  caption={row.item.caption}
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
