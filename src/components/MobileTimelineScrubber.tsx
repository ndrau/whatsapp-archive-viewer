"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type ChatTimelineModel,
  type TimelineDay,
  TIMELINE_EDGE_PADDING,
  dataRatioToCssPercent,
  findTimelineDayAtTrackRatio,
  formatTimelineDay,
  scrubTrackRatioToCssPercent,
} from "@/lib/chat-timeline";

export interface MobileTimelineScrubberHandle {
  setActiveDay: (dayKey: string | undefined) => void;
  showHandle: () => void;
  hideHandle: () => void;
}

interface MobileTimelineScrubberProps {
  model: ChatTimelineModel;
  activeDayKey?: string;
  onSelectDay: (day: TimelineDay) => void;
  onPreviewDay?: (day: TimelineDay) => void;
  onScrubbingChange?: (scrubbing: boolean) => void;
}

function dayPosition(day: TimelineDay): number {
  return (day.startRatio + day.endRatio) / 2;
}

function dayTopPercent(day: TimelineDay): string {
  return `${dataRatioToCssPercent(dayPosition(day))}%`;
}

function yearTopPercent(ratio: number): string {
  return `${dataRatioToCssPercent(ratio)}%`;
}

function pointerTrackRatio(clientY: number, track: HTMLElement): number {
  const rect = track.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
}

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 6"
      className={`h-1.5 w-2.5 ${direction === "down" ? "rotate-180" : ""}`}
    >
      <path
        d="M1 5 5 1l4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const MobileTimelineScrubber = memo(
  forwardRef<MobileTimelineScrubberHandle, MobileTimelineScrubberProps>(
    function MobileTimelineScrubber(
      { model, activeDayKey, onSelectDay, onPreviewDay, onScrubbingChange },
      ref,
    ) {
      const trackRef = useRef<HTMLDivElement>(null);
      const activeDayKeyRef = useRef<string | undefined>(activeDayKey);
      const handleVisibleRef = useRef(false);
      const isScrubbingRef = useRef(false);

      const [handleVisible, setHandleVisible] = useState(false);
      const [expanded, setExpanded] = useState(false);
      const [handleTop, setHandleTop] = useState("50%");
      const [scrubDay, setScrubDay] = useState<TimelineDay | undefined>();
      const [displayYear, setDisplayYear] = useState<number | undefined>();

      const dayByKey = useMemo(() => {
        const map = new Map<string, TimelineDay>();
        for (const day of model.days) {
          map.set(day.key, day);
        }
        return map;
      }, [model.days]);

      const activeDay = useMemo(
        () => model.days.find((day) => day.key === activeDayKey) ?? model.days[0],
        [activeDayKey, model.days],
      );

      const displayDay = scrubDay ?? activeDay;

      const syncHandlePosition = useCallback(
        (dayKey: string | undefined) => {
          const day = dayKey ? dayByKey.get(dayKey) : activeDay;
          if (!day) return;
          setHandleTop(dayTopPercent(day));
          setDisplayYear(day.date.getFullYear());
        },
        [activeDay, dayByKey],
      );

      useImperativeHandle(ref, () => ({
        setActiveDay(dayKey) {
          activeDayKeyRef.current = dayKey;
          if (isScrubbingRef.current) return;
          syncHandlePosition(dayKey);
        },
        showHandle() {
          if (isScrubbingRef.current) return;
          handleVisibleRef.current = true;
          setHandleVisible(true);
        },
        hideHandle() {
          if (isScrubbingRef.current) return;
          handleVisibleRef.current = false;
          setHandleVisible(false);
        },
      }));

      useEffect(() => {
        activeDayKeyRef.current = activeDayKey;
        if (!isScrubbingRef.current) {
          syncHandlePosition(activeDayKey);
        }
      }, [activeDayKey, syncHandlePosition]);

      const scrubDayRef = useRef<TimelineDay | undefined>(undefined);

      const resolveDayForInteraction = useCallback(
        (clientY: number) => {
          const track = trackRef.current;
          if (!track || model.days.length === 0) return undefined;

          const trackRatio = pointerTrackRatio(clientY, track);
          if (trackRatio <= TIMELINE_EDGE_PADDING) return model.days[0];
          if (trackRatio >= 1 - TIMELINE_EDGE_PADDING) return model.days.at(-1);
          return findTimelineDayAtTrackRatio(model.days, trackRatio);
        },
        [model.days],
      );

      const updateScrub = useCallback(
        (clientY: number) => {
          const track = trackRef.current;
          const day = resolveDayForInteraction(clientY);
          if (!track || !day) return;

          scrubDayRef.current = day;
          setScrubDay(day);
          setDisplayYear(day.date.getFullYear());
          setHandleTop(`${scrubTrackRatioToCssPercent(pointerTrackRatio(clientY, track))}%`);
          onPreviewDay?.(day);
        },
        [onPreviewDay, resolveDayForInteraction],
      );

      const scrubStartYRef = useRef(0);
      const scrubDraggedRef = useRef(false);

      const startScrub = useCallback(
        (clientY: number) => {
          isScrubbingRef.current = true;
          scrubStartYRef.current = clientY;
          scrubDraggedRef.current = false;
          handleVisibleRef.current = true;
          setHandleVisible(true);
          setExpanded(true);
          onScrubbingChange?.(true);

          // Keep the currently shown day on tap-in-place; only re-resolve after drag.
          if (scrubDayRef.current || activeDay) {
            const day = scrubDayRef.current ?? activeDay;
            if (day) {
              scrubDayRef.current = day;
              setScrubDay(day);
              setDisplayYear(day.date.getFullYear());
              setHandleTop(dayTopPercent(day));
              onPreviewDay?.(day);
            }
            return;
          }

          updateScrub(clientY);
        },
        [activeDay, onPreviewDay, onScrubbingChange, updateScrub],
      );

      const endScrub = useCallback(() => {
        const day = scrubDayRef.current;
        isScrubbingRef.current = false;
        scrubDraggedRef.current = false;
        setExpanded(false);
        setScrubDay(undefined);
        onScrubbingChange?.(false);

        if (day) {
          syncHandlePosition(day.key);
          onSelectDay(day);
        } else {
          syncHandlePosition(activeDayKeyRef.current);
        }
      }, [onScrubbingChange, onSelectDay, syncHandlePosition]);

      useEffect(() => {
        if (!expanded) return;

        function onMove(event: PointerEvent) {
          event.preventDefault();
          if (!scrubDraggedRef.current) {
            if (Math.abs(event.clientY - scrubStartYRef.current) < 4) return;
            scrubDraggedRef.current = true;
          }
          updateScrub(event.clientY);
        }

        function onUp() {
          endScrub();
        }

        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);

        return () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
        };
      }, [expanded, endScrub, updateScrub]);

      if (model.days.length === 0) return null;

      const showUi = handleVisible || expanded;

      return (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-30 w-0 md:hidden"
          aria-hidden={!showUi}
        >
          {expanded && <div className="pointer-events-auto absolute inset-0 -right-3 bg-black/5" />}

          <div
            ref={trackRef}
            className={`absolute inset-y-3 right-0 transition-[width,opacity] duration-200 ${
              expanded ? "w-[78px] opacity-100" : "w-11 opacity-0"
            }`}
          >
            {expanded && (
              <>
                <div className="absolute inset-y-4 right-3 w-px bg-[var(--wa-muted)]/35" />

                {model.years.map((year) => {
                  const isActive = displayYear === year.year;
                  return (
                    <span
                      key={year.key}
                      className={`absolute right-6 -translate-y-1/2 text-right text-[10px] leading-none ${
                        isActive
                          ? "font-bold text-[var(--wa-accent)]"
                          : "font-semibold text-[var(--wa-text)]/45"
                      }`}
                      style={{ top: yearTopPercent(year.ratio) }}
                    >
                      {year.year}
                    </span>
                  );
                })}

                {model.months.map((month) => (
                  <span
                    key={month.key}
                    aria-hidden="true"
                    className="absolute right-[11px] h-1 w-1 -translate-y-1/2 rounded-full bg-[var(--wa-muted)]/35"
                    style={{ top: yearTopPercent(month.ratio) }}
                  />
                ))}

                {displayDay && (
                  <>
                    <div
                      className="pointer-events-none absolute right-[10px] z-10 h-[2px] w-6 -translate-y-1/2 rounded-full bg-[var(--wa-accent)]"
                      style={{ top: handleTop }}
                    />
                    <div
                      className="pointer-events-none absolute right-[18px] z-20 max-w-[42vw] -translate-x-full -translate-y-1/2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/8"
                      style={{ top: handleTop }}
                    >
                      <p className="text-[11px] font-semibold leading-snug text-[var(--wa-text)]">
                        {formatTimelineDay(displayDay.date)}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            aria-label="Chat-Zeitstrahl"
            className={`pointer-events-auto absolute right-1.5 z-40 flex h-9 w-9 -translate-y-1/2 touch-none flex-col items-center justify-center gap-0 rounded-full bg-[#111b21]/78 text-white shadow-lg backdrop-blur-sm transition-opacity duration-200 ${
              showUi ? "opacity-100" : "opacity-0"
            } ${expanded ? "scale-105 ring-2 ring-white/70" : ""}`}
            style={{
              top: handleTop,
              pointerEvents: showUi ? "auto" : "none",
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              startScrub(event.clientY);
            }}
          >
            <ChevronIcon direction="up" />
            <ChevronIcon direction="down" />
          </button>
        </div>
      );
    },
  ),
);
