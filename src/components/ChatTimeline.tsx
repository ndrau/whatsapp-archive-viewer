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
  findTimelineDayAtRatio,
  findTimelineDayAtTrackRatio,
  formatTimelineDay,
  scrubTrackRatioToCssPercent,
} from "@/lib/chat-timeline";

export interface ChatTimelineHandle {
  previewDay: (day: TimelineDay | undefined) => void;
}

interface ChatTimelineProps {
  model: ChatTimelineModel;
  activeDayKey?: string;
  onSelectDay: (day: TimelineDay) => void;
  onPreviewDay?: (day: TimelineDay) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
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

function applyMarkerPosition(
  line: HTMLElement | null,
  dot: HTMLElement | null,
  labelWrap: HTMLElement | null,
  labelText: HTMLElement | null,
  day: TimelineDay | undefined,
  /** When set, position the marker at the pointer (track space 0–1). */
  trackRatio?: number,
) {
  if (!day) return;

  // During scrub/hover, follow the pointer but stop at the padding edges —
  // never draw the marker into the top/bottom inset.
  const top =
    trackRatio === undefined
      ? dayTopPercent(day)
      : `${scrubTrackRatioToCssPercent(trackRatio)}%`;

  if (line) line.style.top = top;
  if (dot) dot.style.top = top;
  if (labelWrap) labelWrap.style.top = top;
  if (labelText) labelText.textContent = formatTimelineDay(day.date);
}

function pointerTrackRatio(clientY: number, track: HTMLElement): number {
  const rect = track.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
}

export const ChatTimeline = memo(
  forwardRef<ChatTimelineHandle, ChatTimelineProps>(function ChatTimeline(
    {
      model,
      activeDayKey,
      onSelectDay,
      onPreviewDay,
      onScrubStart,
      onScrubEnd,
    },
    ref,
  ) {
    const trackRef = useRef<HTMLDivElement>(null);
    const lineRef = useRef<HTMLDivElement>(null);
    const dotRef = useRef<HTMLSpanElement>(null);
    const labelWrapRef = useRef<HTMLDivElement>(null);
    const labelTextRef = useRef<HTMLParagraphElement>(null);
    const previewDayRef = useRef<TimelineDay | undefined>(undefined);
    /** Day currently shown in the tooltip — click/select must use this, not a re-hit-test. */
    const shownDayRef = useRef<TimelineDay | undefined>(undefined);
    const pendingJumpKeyRef = useRef<string | undefined>(undefined);
    const edgePinnedRef = useRef(false);
    const isScrubbingRef = useRef(false);
    const hoverDayRef = useRef<TimelineDay | undefined>(undefined);
    const lastTrackRatioRef = useRef(0.5);
    const selectedOnPointerUpRef = useRef(false);

    const [hoverDay, setHoverDay] = useState<TimelineDay | undefined>();
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [displayYear, setDisplayYear] = useState<number | undefined>();

    const activeDay = useMemo(
      () => model.days.find((day) => day.key === activeDayKey) ?? model.days[0],
      [activeDayKey, model.days],
    );

    const displayDay = hoverDay ?? previewDayRef.current ?? activeDay;

    const paintDay = useCallback((day: TimelineDay | undefined, trackRatio?: number) => {
      if (day) shownDayRef.current = day;
      applyMarkerPosition(
        lineRef.current,
        dotRef.current,
        labelWrapRef.current,
        labelTextRef.current,
        day,
        trackRatio,
      );
      if (day) setDisplayYear(day.date.getFullYear());
    }, []);

    useImperativeHandle(ref, () => ({
      previewDay(day) {
        if (isScrubbingRef.current || hoverDayRef.current) return;
        edgePinnedRef.current = false;
        previewDayRef.current = day;
        if (pendingJumpKeyRef.current && day?.key !== pendingJumpKeyRef.current) return;
        if (day && day.key === pendingJumpKeyRef.current) {
          pendingJumpKeyRef.current = undefined;
        }
        paintDay(day ?? activeDay);
      },
    }));

    useEffect(() => {
      if (isScrubbing || hoverDay) return;

      // After a scrub-select, keep the chosen day until scroll sync catches up.
      if (
        pendingJumpKeyRef.current &&
        activeDay?.key !== pendingJumpKeyRef.current &&
        previewDayRef.current
      ) {
        paintDay(previewDayRef.current);
        return;
      }

      if (activeDay?.key === pendingJumpKeyRef.current) {
        pendingJumpKeyRef.current = undefined;
      }

      // Edge pin after leaving above/below — don't snap back to scroll day.
      if (edgePinnedRef.current && previewDayRef.current) {
        if (activeDay?.key === previewDayRef.current.key) {
          edgePinnedRef.current = false;
        } else {
          return;
        }
      }

      previewDayRef.current = activeDay;
      paintDay(activeDay);
    }, [activeDay, hoverDay, isScrubbing, paintDay]);

    const showDayAtPointer = useCallback(
      (clientY: number, day: TimelineDay) => {
        const track = trackRef.current;
        if (!track) return;

        const trackRatio = pointerTrackRatio(clientY, track);
        lastTrackRatioRef.current = trackRatio;
        hoverDayRef.current = day;
        setHoverDay(day);
        paintDay(day, trackRatio);
      },
      [paintDay],
    );

    const resolveDayForInteraction = useCallback(
      (clientY: number) => {
        const track = trackRef.current;
        if (!track || model.days.length === 0) return undefined;

        const trackRatio = pointerTrackRatio(clientY, track);
        lastTrackRatioRef.current = trackRatio;

        // In the padding band the marker is clamped — always use first/last day
        // so a click on "29. Mai" cannot land on a neighboring micro-day.
        if (trackRatio <= TIMELINE_EDGE_PADDING) {
          return model.days[0];
        }
        if (trackRatio >= 1 - TIMELINE_EDGE_PADDING) {
          return model.days.at(-1);
        }

        return findTimelineDayAtTrackRatio(model.days, trackRatio);
      },
      [model.days],
    );

    const handlePointer = useCallback(
      (clientY: number) => {
        const day = resolveDayForInteraction(clientY);
        if (!day) return;
        edgePinnedRef.current = false;
        showDayAtPointer(clientY, day);
        return day;
      },
      [resolveDayForInteraction, showDayAtPointer],
    );

    const pinToEdge = useCallback(
      (edge: "start" | "end") => {
        const day = edge === "start" ? model.days[0] : model.days.at(-1);
        if (!day) return;

        const trackRatio = edge === "start" ? TIMELINE_EDGE_PADDING : 1 - TIMELINE_EDGE_PADDING;
        lastTrackRatioRef.current = trackRatio;
        edgePinnedRef.current = true;
        pendingJumpKeyRef.current = undefined;
        hoverDayRef.current = undefined;
        setHoverDay(undefined);
        previewDayRef.current = day;
        paintDay(day, trackRatio);
        onPreviewDay?.(day);
      },
      [model.days, onPreviewDay, paintDay],
    );

    useEffect(() => {
      if (!isScrubbing) return;

      function onMove(event: PointerEvent) {
        const day = resolveDayForInteraction(event.clientY);
        if (!day) return;
        showDayAtPointer(event.clientY, day);
        onPreviewDay?.(day);
      }

      function onUp() {
        // Select the day the tooltip already shows — never re-hit-test on release
        // (tiny pointer jitter near the top used to jump May 29 → June 2).
        const day = shownDayRef.current ?? previewDayRef.current;
        isScrubbingRef.current = false;
        setIsScrubbing(false);

        if (day) {
          previewDayRef.current = day;
          pendingJumpKeyRef.current = day.key;
          hoverDayRef.current = undefined;
          setHoverDay(undefined);
          paintDay(day);
          onScrubEnd?.();
          if (!selectedOnPointerUpRef.current) {
            selectedOnPointerUpRef.current = true;
            onSelectDay(day);
          }
          return;
        }

        hoverDayRef.current = undefined;
        setHoverDay(undefined);
        onScrubEnd?.();
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);

      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    }, [
      isScrubbing,
      onPreviewDay,
      onScrubEnd,
      onSelectDay,
      paintDay,
      resolveDayForInteraction,
      showDayAtPointer,
    ]);

    if (model.days.length === 0) return null;

    return (
      <aside className="relative hidden w-[104px] shrink-0 border-l border-black/5 bg-white/40 md:block lg:w-[220px] xl:w-[240px]">
        {/* Full-height hit target so top/bottom padding doesn't trigger leave/jump */}
        <div
          ref={trackRef}
          className="timeline-track absolute inset-0 cursor-pointer"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;

            event.preventDefault();
            selectedOnPointerUpRef.current = false;
            pendingJumpKeyRef.current = undefined;
            edgePinnedRef.current = false;
            onScrubStart?.();
            isScrubbingRef.current = true;
            setIsScrubbing(true);

            try {
              trackRef.current?.setPointerCapture(event.pointerId);
            } catch {
              // ignore — capture is optional
            }

            const day = handlePointer(event.clientY);
            if (day) onPreviewDay?.(day);
          }}
          onPointerMove={(event) => {
            if (isScrubbing) return;
            handlePointer(event.clientY);
          }}
          onPointerLeave={(event) => {
            if (isScrubbingRef.current) return;

            const track = trackRef.current;
            if (!track) return;

            const rect = track.getBoundingClientRect();
            // Leaving above/below: stay pinned at the edge instead of jumping
            // back to the current scroll-synced day.
            if (event.clientY <= rect.top + 2 || lastTrackRatioRef.current <= 0.02) {
              pinToEdge("start");
              return;
            }
            if (event.clientY >= rect.bottom - 2 || lastTrackRatioRef.current >= 0.98) {
              pinToEdge("end");
              return;
            }

            hoverDayRef.current = undefined;
            setHoverDay(undefined);
          }}
        >
          <div
            className="pointer-events-none absolute right-[10px] w-px bg-[var(--wa-muted)]/30 lg:right-[12px]"
            style={{
              top: `${TIMELINE_EDGE_PADDING * 100}%`,
              bottom: `${TIMELINE_EDGE_PADDING * 100}%`,
            }}
          />

          <div className="pointer-events-none absolute inset-y-0 left-0 w-11 lg:w-[3.25rem]">
            {model.years.map((year) => {
              const isActive = displayYear === year.year;

              return (
                <button
                  key={year.key}
                  type="button"
                  className={`timeline-year pointer-events-auto absolute inset-x-0 -translate-y-1/2 px-1 text-right text-[10px] leading-none lg:text-[11px] ${
                    isActive
                      ? "font-bold text-[var(--wa-accent)]"
                      : "font-semibold text-[var(--wa-text)]/55 hover:text-[var(--wa-accent)]"
                  }`}
                  style={{ top: yearTopPercent(year.ratio) }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectedOnPointerUpRef.current = true;
                    pendingJumpKeyRef.current = undefined;
                    const day = findTimelineDayAtRatio(model.days, year.ratio);
                    if (day) onSelectDay(day);
                  }}
                >
                  {year.year}
                </button>
              );
            })}
          </div>

          {model.months.map((month) => (
            <button
              key={month.key}
              type="button"
              aria-label={month.label}
              className="timeline-month absolute right-[8px] h-1 w-1 -translate-y-1/2 rounded-full bg-[var(--wa-muted)]/40 transition hover:scale-125 hover:bg-[var(--wa-accent)] lg:right-[10px]"
              style={{ top: yearTopPercent(month.ratio) }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                selectedOnPointerUpRef.current = true;
                pendingJumpKeyRef.current = undefined;
                const day = findTimelineDayAtRatio(model.days, month.ratio);
                if (day) onSelectDay(day);
              }}
            />
          ))}

          {displayDay && (
            <>
              <div
                ref={lineRef}
                className="pointer-events-none absolute left-11 right-[13px] z-10 h-[2px] -translate-y-1/2 rounded-full bg-[var(--wa-accent)] lg:left-[3.25rem] lg:right-[15px]"
                style={{ top: dayTopPercent(displayDay) }}
              />
              <span
                ref={dotRef}
                className="pointer-events-none absolute right-[7px] z-10 h-2 w-2 -translate-y-1/2 rounded-full border border-white bg-[var(--wa-accent)] shadow lg:right-[9px]"
                style={{ top: dayTopPercent(displayDay) }}
              />
              <div
                ref={labelWrapRef}
                className="pointer-events-none absolute left-11 right-[18px] z-20 flex -translate-y-1/2 justify-end lg:left-[3.25rem] lg:right-[22px]"
                style={{ top: dayTopPercent(displayDay) }}
              >
                <div className="rounded-lg bg-white px-2.5 py-1.5 shadow-md ring-1 ring-black/8">
                  <p
                    ref={labelTextRef}
                    className="whitespace-nowrap text-[10px] font-semibold leading-none text-[var(--wa-text)] lg:text-[11px]"
                  >
                    {formatTimelineDay(displayDay.date)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    );
  }),
);
