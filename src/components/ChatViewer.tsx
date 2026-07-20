"use client";

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
import { DEFAULT_DAY_RADIUS, MAX_LOADED_DAYS, dayKeyFromDate } from "@/lib/chat-day";
import { buildChatTimeline, type TimelineDay } from "@/lib/chat-timeline";
import {
  buildVirtualRows,
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

/** Prefetch when the edge sentinel enters this margin around the viewport. */
const EXTEND_ROOT_MARGIN = "800px 0px";
const HANDLE_HIDE_MS = 1800;
const JUMP_LOCK_MS = 750;

function escapeAttr(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

export function ChatViewer({ chatIndex, exportData, myName, searchQuery }: ChatViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const windowLoadingRef = useRef(false);
  const extendLoadingRef = useRef(false);
  const loadGenerationRef = useRef(0);
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
  const lastPreviewDayKeyRef = useRef<string | undefined>(undefined);
  const searchGenerationRef = useRef(0);
  const extendChainRef = useRef(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeDayKey, setActiveDayKey] = useState<string>();
  const [loadingWindow, setLoadingWindow] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<VirtualChatRow[]>([]);
  const [searchActive, setSearchActive] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string>();
  const [lightbox, setLightbox] = useState<{
    items: MediaGalleryItem[];
    index: number;
  } | null>(null);

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

  // Keep scroll position stable when older messages are prepended.
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const container = scrollRef.current;
    if (!anchor || !container) return;

    scrollAnchorRef.current = null;
    container.scrollTop = anchor.top + (container.scrollHeight - anchor.height);
  }, [messages]);

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

    const rootRect = container.getBoundingClientRect();
    const anchorY = rootRect.top + container.clientHeight * 0.22;
    const nodes = container.querySelectorAll<HTMLElement>("[data-day-key]");

    let best: string | undefined;
    let bestDist = Infinity;

    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom < rootRect.top - 80 || rect.top > rootRect.bottom + 80) continue;
      const mid = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(mid - anchorY);
      if (dist < bestDist) {
        bestDist = dist;
        best = node.dataset.dayKey;
      }
    }

    return best;
  }, [rows.length]);

  const scheduleHandleHide = useCallback(() => {
    clearTimeout(overlayHideTimerRef.current);
    overlayHideTimerRef.current = setTimeout(() => {
      if (scrubbingRef.current) return;
      mobileScrubberRef.current?.hideHandle();
    }, HANDLE_HIDE_MS);
  }, []);

  const applyPendingScroll = useCallback(() => {
    const target = pendingScrollRef.current;
    const container = scrollRef.current;
    if (!target || !container) {
      scrollReadyRef.current = true;
      return;
    }

    pendingScrollRef.current = null;

    const scrollOnce = (): boolean => {
      if (target.messageId) {
        const id = escapeAttr(target.messageId);
        const el =
          container.querySelector<HTMLElement>(`[data-message-id="${id}"]`) ??
          container.querySelector<HTMLElement>(`[data-message-ids~="${id}"]`);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "auto" });
          return true;
        }
        return false;
      }

      if (target.dayKey) {
        const el = container.querySelector<HTMLElement>(
          `[data-day-header="${escapeAttr(target.dayKey)}"]`,
        );
        if (el) {
          el.scrollIntoView({
            block: target.align === "end" ? "end" : "start",
            behavior: "auto",
          });
          return true;
        }
      }

      if (target.align === "end") {
        container.scrollTop = container.scrollHeight;
        return true;
      }

      return false;
    };

    scrollOnce();
    requestAnimationFrame(() => {
      scrollOnce();
      requestAnimationFrame(() => {
        scrollOnce();
        scrollReadyRef.current = true;
      });
    });
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
      extendChainRef.current += 1;

      if (!options?.preserveScroll) {
        setLoadingWindow(true);
      }
      setLoadError(null);

      try {
        const response = await loadChatMessageRange(chatIndex.slug, fromDay, toDay);
        if (generation !== loadGenerationRef.current) return;

        const nextMessages = response.messages.map((message) => ({
          ...message,
          date: new Date(message.date),
        }));

        windowRangeRef.current = { start: startIndex, end: endIndex };
        setMessages(nextMessages);
        setLoadError(null);

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
        setLoadError(
          error instanceof Error ? error.message : "Nachrichten konnten nicht geladen werden.",
        );
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
    setMessages([]);
    setActiveDayKey(undefined);
    setSearchActive(false);
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(false);
    setHighlightMessageId(undefined);
    setLoadError(null);
    setLoadingWindow(true);
    windowRangeRef.current = { start: 0, end: 0 };
    scrollReadyRef.current = false;
    pendingScrollRef.current = null;
    activeDayRef.current = undefined;
    lastPreviewDayKeyRef.current = undefined;
    hasInitializedRef.current = false;
  }, [chatIndex.slug]);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    const lastIndex = chatIndex.days.length - 1;
    if (lastIndex < 0) {
      setLoadingWindow(false);
      return;
    }

    hasInitializedRef.current = true;
    const startIndex = Math.max(0, lastIndex - DEFAULT_DAY_RADIUS);
    void loadRangeByIndices(startIndex, lastIndex, {
      scrollTarget: { dayKey: chatIndex.days[lastIndex]?.key, align: "end" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIndex.slug, chatIndex.days]);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    const generation = ++searchGenerationRef.current;

    searchTimerRef.current = setTimeout(async () => {
      const normalized = searchQuery.trim();
      if (!normalized) {
        if (generation !== searchGenerationRef.current) return;
        setSearchActive(false);
        setSearchResults([]);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      setSearchError(null);

      try {
        const response = await searchChatMessages(chatIndex.slug, normalized);
        if (generation !== searchGenerationRef.current) return;

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
      } catch (error) {
        if (generation !== searchGenerationRef.current) return;
        setSearchActive(true);
        setSearchResults([]);
        setSearchError(
          error instanceof Error ? error.message : "Suche fehlgeschlagen.",
        );
      } finally {
        if (generation === searchGenerationRef.current) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(searchTimerRef.current);
  }, [chatIndex.slug, searchQuery]);

  useLayoutEffect(() => {
    if (searchActive) {
      scrollReadyRef.current = true;
      return;
    }
    if (!pendingScrollRef.current) {
      if (messages.length > 0) scrollReadyRef.current = true;
      return;
    }
    if (rows.length === 0) return;
    applyPendingScroll();
  }, [applyPendingScroll, messages.length, rows.length, searchActive]);

  const extendWindowEdge = useCallback(
    async (direction: "prev" | "next"): Promise<boolean> => {
      if (windowLoadingRef.current || extendLoadingRef.current || searchActive) return false;

      const container = scrollRef.current;
      const { start, end } = windowRangeRef.current;
      const generation = loadGenerationRef.current;
      const dayKeys = chatIndex.days;

      const allowedDayKeys = (rangeStart: number, rangeEnd: number) =>
        new Set(dayKeys.slice(rangeStart, rangeEnd + 1).map((day) => day.key));

      if (direction === "prev" && start > 0) {
        const nextStart = Math.max(0, start - DEFAULT_DAY_RADIUS);
        let nextEnd = end;
        if (nextEnd - nextStart + 1 > MAX_LOADED_DAYS) {
          nextEnd = nextStart + MAX_LOADED_DAYS - 1;
        }

        const fromDay = dayKeys[nextStart]?.key;
        const toDay = dayKeys[start - 1]?.key;
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
          if (generation !== loadGenerationRef.current) {
            scrollAnchorRef.current = null;
            return false;
          }

          const incoming = response.messages.map((message) => ({
            ...message,
            date: new Date(message.date),
          }));
          const keepKeys = allowedDayKeys(nextStart, nextEnd);
          const trimTail = nextEnd < end;

          let didPrepend = false;
          setMessages((current) => {
            const knownIds = new Set(current.map((message) => message.id));
            const prepended = incoming.filter((message) => !knownIds.has(message.id));
            if (prepended.length === 0 && !trimTail) return current;
            didPrepend = prepended.length > 0 || trimTail;
            const merged = [...prepended, ...current];
            if (!trimTail) return merged;
            return merged.filter((message) => keepKeys.has(dayKeyFromDate(message.date)));
          });

          if (didPrepend) {
            windowRangeRef.current = { start: nextStart, end: nextEnd };
          } else {
            scrollAnchorRef.current = null;
          }
          return didPrepend;
        } catch (error) {
          console.error("Ältere Nachrichten konnten nicht geladen werden.", error);
          scrollAnchorRef.current = null;
          return false;
        } finally {
          extendLoadingRef.current = false;
        }
      }

      if (direction === "next" && end < dayKeys.length - 1) {
        let nextStart = start;
        const nextEnd = Math.min(dayKeys.length - 1, end + DEFAULT_DAY_RADIUS);
        if (nextEnd - nextStart + 1 > MAX_LOADED_DAYS) {
          nextStart = nextEnd - MAX_LOADED_DAYS + 1;
        }

        const fromDay = dayKeys[end + 1]?.key;
        const toDay = dayKeys[nextEnd]?.key;
        if (!fromDay || !toDay || nextEnd === end) return false;

        extendLoadingRef.current = true;

        try {
          const response = await loadChatMessageRange(chatIndex.slug, fromDay, toDay);
          if (generation !== loadGenerationRef.current) return false;

          const incoming = response.messages.map((message) => ({
            ...message,
            date: new Date(message.date),
          }));
          const keepKeys = allowedDayKeys(nextStart, nextEnd);
          const trimHead = nextStart > start;

          let didAppend = false;
          setMessages((current) => {
            const knownIds = new Set(current.map((message) => message.id));
            const appended = incoming.filter((message) => !knownIds.has(message.id));
            if (appended.length === 0 && !trimHead) return current;
            didAppend = appended.length > 0 || trimHead;
            const merged = [...current, ...appended];
            if (!trimHead) return merged;
            return merged.filter((message) => keepKeys.has(dayKeyFromDate(message.date)));
          });

          if (didAppend) {
            windowRangeRef.current = { start: nextStart, end: nextEnd };
          }
          return didAppend;
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

  const canExtend = useCallback(
    (direction: "prev" | "next") => {
      // Jump-lock only pins the timeline highlight — do not block window extend.
      if (
        !scrollReadyRef.current ||
        pendingScrollRef.current ||
        windowLoadingRef.current ||
        extendLoadingRef.current ||
        searchActive
      ) {
        return false;
      }

      const { start, end } = windowRangeRef.current;
      if (direction === "prev") return start > 0;
      return end < chatIndex.days.length - 1;
    },
    [chatIndex.days.length, searchActive],
  );

  const runExtendChain = useCallback(
    async (direction: "prev" | "next") => {
      const chainId = ++extendChainRef.current;

      while (canExtend(direction)) {
        if (chainId !== extendChainRef.current) return;

        const did = await extendWindowEdge(direction);
        if (!did || chainId !== extendChainRef.current) return;

        // Wait for prepend scroll-anchor layout before deciding whether to load again.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        const container = scrollRef.current;
        const sentinel =
          direction === "prev" ? topSentinelRef.current : bottomSentinelRef.current;
        if (!container || !sentinel) return;

        const rootRect = container.getBoundingClientRect();
        const rect = sentinel.getBoundingClientRect();
        const margin = 800;
        const stillNear =
          direction === "prev"
            ? rect.bottom >= rootRect.top - margin
            : rect.top <= rootRect.bottom + margin;

        if (!stillNear) return;
      }
    },
    [canExtend, extendWindowEdge],
  );

  // Reliable infinite scroll: observe edge sentinels (not scrollTop math on a virtual list).
  useEffect(() => {
    if (searchActive || loadingWindow || rows.length === 0) return;

    const root = scrollRef.current;
    const top = topSentinelRef.current;
    const bottom = bottomSentinelRef.current;
    if (!root || !top || !bottom) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === top) {
            void runExtendChain("prev");
          } else if (entry.target === bottom) {
            void runExtendChain("next");
          }
        }
      },
      { root, rootMargin: EXTEND_ROOT_MARGIN, threshold: 0 },
    );

    observer.observe(top);
    observer.observe(bottom);

    const kickIfNearEdge = () => {
      if (!scrollReadyRef.current || pendingScrollRef.current) return;
      const { start, end } = windowRangeRef.current;
      if (root.scrollTop < 900 && start > 0) void runExtendChain("prev");
      const distanceBottom = root.scrollHeight - root.scrollTop - root.clientHeight;
      if (distanceBottom < 900 && end < chatIndex.days.length - 1) {
        void runExtendChain("next");
      }
    };

    // IO may not re-fire while a sentinel stays visible; kick after scroll settles.
    const kickA = window.setTimeout(kickIfNearEdge, 160);
    const kickB = window.setTimeout(kickIfNearEdge, 800);

    return () => {
      observer.disconnect();
      window.clearTimeout(kickA);
      window.clearTimeout(kickB);
    };
  }, [chatIndex.days.length, loadingWindow, rows.length, runExtendChain, searchActive]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || searchActive) return;

    let timelineRaf = 0;

    const syncTimelineFromScroll = () => {
      timelineRaf = 0;
      const jumpLocked = performance.now() < jumpLockUntilRef.current;

      if (!jumpLocked) {
        const nextDayKey = resolveActiveDayFromScroll();
        if (nextDayKey) {
          activeDayRef.current = nextDayKey;
          previewTimelineDay(nextDayKey);
        }
      } else if (activeDayRef.current) {
        previewTimelineDay(activeDayRef.current);
      }
    };

    const onScroll = () => {
      if (!timelineRaf) {
        timelineRaf = requestAnimationFrame(syncTimelineFromScroll);
      }

      if (isMobileRef.current && !scrubbingRef.current) {
        mobileScrubberRef.current?.showHandle();
        scheduleHandleHide();
      }
    };

    const onScrollEnd = () => {
      if (timelineRaf) {
        cancelAnimationFrame(timelineRaf);
        timelineRaf = 0;
      }
      syncTimelineFromScroll();
      if (activeDayRef.current) {
        setActiveDayKey(activeDayRef.current);
      }
    };

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onScrollWithIdle = () => {
      onScroll();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(onScrollEnd, 180);
    };

    const supportsScrollEnd = "onscrollend" in container;
    container.addEventListener("scroll", supportsScrollEnd ? onScroll : onScrollWithIdle, {
      passive: true,
    });
    if (supportsScrollEnd) {
      container.addEventListener("scrollend", onScrollEnd, { passive: true });
    }

    return () => {
      container.removeEventListener("scroll", supportsScrollEnd ? onScroll : onScrollWithIdle);
      container.removeEventListener("scrollend", onScrollEnd);
      clearTimeout(idleTimer);
      clearTimeout(overlayHideTimerRef.current);
      if (timelineRaf) cancelAnimationFrame(timelineRaf);
    };
  }, [previewTimelineDay, resolveActiveDayFromScroll, scheduleHandleHide, searchActive]);

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

      jumpLockUntilRef.current = performance.now() + JUMP_LOCK_MS;
      activeDayRef.current = row.dayKey;
      lastPreviewDayKeyRef.current = undefined;
      setActiveDayKey(row.dayKey);
      previewTimelineDay(row.dayKey);

      const startIndex = Math.max(0, dayIndex - DEFAULT_DAY_RADIUS);
      const endIndex = Math.min(chatIndex.days.length - 1, dayIndex + DEFAULT_DAY_RADIUS);

      await loadRangeByIndices(startIndex, endIndex, {
        scrollTarget: {
          dayKey: row.dayKey,
          messageId: row.messageId,
        },
      });
    },
    [chatIndex.days, loadRangeByIndices, previewTimelineDay],
  );

  const searchEmpty =
    searchActive &&
    !searchLoading &&
    !searchError &&
    searchResults.length === 0 &&
    Boolean(searchQuery.trim());
  const chatEmpty = !searchActive && messages.length === 0 && !loadingWindow && !loadError;

  return (
    <>
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-[var(--wa-chat-bg)]/90 shadow-inner">
        <div ref={scrollRef} className="chat-scroll relative min-h-0 flex-1 overflow-y-auto p-4 pr-2">
          {loadingWindow && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center text-xs text-[var(--wa-muted)]">
              Nachrichten werden geladen…
            </div>
          )}

          {loadError && !searchActive ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                className="rounded-full bg-[var(--wa-accent)] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  const lastIndex = chatIndex.days.length - 1;
                  if (lastIndex < 0) return;
                  const startIndex = Math.max(0, lastIndex - DEFAULT_DAY_RADIUS);
                  void loadRangeByIndices(startIndex, lastIndex, {
                    scrollTarget: { dayKey: chatIndex.days[lastIndex]?.key, align: "end" },
                  });
                }}
              >
                Erneut versuchen
              </button>
            </div>
          ) : searchError ? (
            <div className="flex min-h-[40vh] items-center justify-center p-10 text-center text-sm text-red-700">
              {searchError}
            </div>
          ) : searchLoading && searchActive ? (
            <div className="flex min-h-[40vh] items-center justify-center p-10 text-center text-sm text-[var(--wa-muted)]">
              Suche läuft…
            </div>
          ) : searchEmpty || chatEmpty ? (
            <div className="flex min-h-[40vh] items-center justify-center p-10 text-center text-[var(--wa-muted)]">
              {searchEmpty ? "Keine Nachrichten für diese Suche gefunden." : "Keine Nachrichten in diesem Chat."}
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2.5">
              {!searchActive && (
                <div
                  ref={topSentinelRef}
                  className="h-px w-full shrink-0"
                  aria-hidden
                  data-extend-edge="prev"
                />
              )}

              {rows.map((row) => (
                <ChatRow
                  key={row.id}
                  row={row}
                  exportData={exportData}
                  myName={myName}
                  highlightMessageId={highlightMessageId}
                  onOpenMedia={openMedia}
                  onOpenSearchResult={openSearchResult}
                />
              ))}

              {!searchActive && (
                <div
                  ref={bottomSentinelRef}
                  className="h-px w-full shrink-0"
                  aria-hidden
                  data-extend-edge="next"
                />
              )}
            </div>
          )}
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

interface ChatRowProps {
  row: VirtualChatRow;
  exportData: WhatsAppExport;
  myName: string;
  highlightMessageId?: string;
  onOpenMedia: (items: MediaGalleryItem[], index: number) => void;
  onOpenSearchResult: (row: Extract<VirtualChatRow, { kind: "search-result" }>) => void;
}

function ChatRow({
  row,
  exportData,
  myName,
  highlightMessageId,
  onOpenMedia,
  onOpenSearchResult,
}: ChatRowProps) {
  if (row.kind === "day-header") {
    return (
      <div
        className="flex justify-center"
        data-day-key={row.dayKey}
        data-day-header={row.dayKey}
      >
        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[var(--wa-muted)] shadow-sm">
          {row.label}
        </span>
      </div>
    );
  }

  if (row.kind === "search-result") {
    return (
      <button
        type="button"
        onClick={() => void onOpenSearchResult(row)}
        className="w-full rounded-2xl bg-white/90 px-4 py-3 text-left shadow-sm transition hover:bg-white"
        data-day-key={row.dayKey}
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
    );
  }

  if (row.item.kind === "media-group") {
    const highlighted = Boolean(
      highlightMessageId &&
        row.item.messages.some((message) => message.id === highlightMessageId),
    );
    return (
      <div
        data-day-key={row.dayKey}
        data-message-ids={row.item.messages.map((message) => message.id).join(" ")}
        className={highlighted ? "rounded-2xl ring-2 ring-[var(--wa-accent)]/40" : undefined}
      >
        <MediaGroupBubble
          sender={row.item.sender}
          date={row.item.date}
          caption={row.item.caption}
          items={row.item.items}
          exportData={exportData}
          isOutgoing={row.item.sender === myName}
          onOpenMedia={onOpenMedia}
        />
      </div>
    );
  }

  return (
    <div
      data-day-key={row.dayKey}
      data-message-id={row.item.message.id}
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
  );
}
