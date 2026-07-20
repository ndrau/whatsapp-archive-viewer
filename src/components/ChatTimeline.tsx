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
  dataRatioToTrackRatio,
  findTimelineDayAtRatio,
  findTimelineDayAtTrackRatio,
  formatTimelineDay,
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

function ratioToPercent(ratio: number): string {
  return `${dataRatioToTrackRatio(ratio) * 100}%`;
}

function dayPosition(day: TimelineDay): number {
  return (day.startRatio + day.endRatio) / 2;
}

function trackRatioToPercent(trackRatio: number): string {
  return `${Math.min(1, Math.max(0, trackRatio)) * 100}%`;
}

function applyMarkerPosition(
  line: HTMLElement | null,
  dot: HTMLElement | null,
  labelWrap: HTMLElement | null,
  labelText: HTMLElement | null,
  day: TimelineDay | undefined,
  trackRatio?: number,
) {
  if (!day) return;

  const top =
    trackRatio === undefined ? ratioToPercent(dayPosition(day)) : trackRatioToPercent(trackRatio);
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
    const isScrubbingRef = useRef(false);
    const hoverDayRef = useRef<TimelineDay | undefined>(undefined);
    const selectedOnPointerUpRef = useRef(false);

    const [hoverDay, setHoverDay] = useState<TimelineDay | undefined>();
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [displayYear, setDisplayYear] = useState<number | undefined>();

    const activeDay = useMemo(
      () => model.days.find((day) => day.key === activeDayKey) ?? model.days[0],
      [activeDayKey, model.days],
    );

    const displayDay = hoverDay ?? previewDayRef.current ?? activeDay;

    useImperativeHandle(ref, () => ({
      previewDay(day) {
        previewDayRef.current = day;
        if (isScrubbingRef.current || hoverDayRef.current) return;
        applyMarkerPosition(
          lineRef.current,
          dotRef.current,
          labelWrapRef.current,
          labelTextRef.current,
          day ?? activeDay,
        );
        setDisplayYear((day ?? activeDay)?.date.getFullYear());
      },
    }));

    useEffect(() => {
      if (isScrubbing || hoverDay) return;
      previewDayRef.current = activeDay;
      applyMarkerPosition(
        lineRef.current,
        dotRef.current,
        labelWrapRef.current,
        labelTextRef.current,
        activeDay,
      );
      setDisplayYear(activeDay?.date.getFullYear());
    }, [activeDay, hoverDay, isScrubbing]);

    const resolveDayFromPointer = useCallback(
      (clientY: number) => {
        const track = trackRef.current;
        if (!track || model.days.length === 0) return undefined;

        const trackRatio = pointerTrackRatio(clientY, track);
        return findTimelineDayAtTrackRatio(model.days, trackRatio);
      },
      [model.days],
    );

    const showDayAtPointer = useCallback(
      (clientY: number, day: TimelineDay) => {
        const track = trackRef.current;
        if (!track) return;

        hoverDayRef.current = day;
        setHoverDay(day);
        setDisplayYear(day.date.getFullYear());
        applyMarkerPosition(
          lineRef.current,
          dotRef.current,
          labelWrapRef.current,
          labelTextRef.current,
          day,
          pointerTrackRatio(clientY, track),
        );
      },
      [],
    );

    const handlePointer = useCallback(
      (clientY: number) => {
        const day = resolveDayFromPointer(clientY);
        if (!day) return;
        showDayAtPointer(clientY, day);
        return day;
      },
      [resolveDayFromPointer, showDayAtPointer],
    );

    useEffect(() => {
      if (!isScrubbing) return;

      function onMove(event: PointerEvent) {
        const day = resolveDayFromPointer(event.clientY);
        if (!day) return;
        showDayAtPointer(event.clientY, day);
        onPreviewDay?.(day);
      }

      function onUp(event: PointerEvent) {
        const day = resolveDayFromPointer(event.clientY);
        isScrubbingRef.current = false;
        setIsScrubbing(false);
        hoverDayRef.current = undefined;
        setHoverDay(undefined);
        previewDayRef.current = day ?? previewDayRef.current;
        onScrubEnd?.();
        if (day && !selectedOnPointerUpRef.current) {
          selectedOnPointerUpRef.current = true;
          onSelectDay(day);
        }
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);

      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    }, [isScrubbing, onPreviewDay, onScrubEnd, onSelectDay, resolveDayFromPointer, showDayAtPointer]);

    if (model.days.length === 0) return null;

    return (
      <aside className="relative hidden w-[88px] shrink-0 overflow-hidden border-l border-black/5 bg-white/40 md:block lg:w-[156px] xl:w-[176px]">
        <div
          ref={trackRef}
          className="timeline-track absolute inset-0 cursor-pointer"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;

            event.preventDefault();
            selectedOnPointerUpRef.current = false;
            onScrubStart?.();
            isScrubbingRef.current = true;
            setIsScrubbing(true);
            const day = handlePointer(event.clientY);
            if (day) onPreviewDay?.(day);
          }}
          onPointerMove={(event) => {
            if (isScrubbing) return;
            handlePointer(event.clientY);
          }}
          onPointerLeave={() => {
            if (!isScrubbingRef.current) {
              hoverDayRef.current = undefined;
              setHoverDay(undefined);
            }
          }}
        >
          <div className="absolute inset-y-6 right-3 w-px bg-[var(--wa-muted)]/30 lg:right-4" />

          {model.years.map((year) => {
            const isActive = displayYear === year.year;

            return (
              <button
                key={year.key}
                type="button"
                className={`timeline-year absolute left-1 right-6 -translate-y-1/2 text-right text-[10px] leading-none lg:left-2 lg:right-10 xl:text-[11px] ${
                  isActive
                    ? "font-bold text-[var(--wa-accent)]"
                    : "font-semibold text-[var(--wa-text)]/55 hover:text-[var(--wa-accent)]"
                }`}
                style={{ top: ratioToPercent(year.ratio) }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  selectedOnPointerUpRef.current = true;
                  const day = findTimelineDayAtRatio(model.days, year.ratio);
                  if (day) onSelectDay(day);
                }}
              >
                {year.year}
              </button>
            );
          })}

          {model.months.map((month) => (
            <button
              key={month.key}
              type="button"
              aria-label={month.label}
              className="timeline-month absolute right-[10px] h-1 w-1 -translate-y-1/2 rounded-full bg-[var(--wa-muted)]/40 transition hover:scale-125 hover:bg-[var(--wa-accent)] lg:right-[14px]"
              style={{ top: ratioToPercent(month.ratio) }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                selectedOnPointerUpRef.current = true;
                const day = findTimelineDayAtRatio(model.days, month.ratio);
                if (day) onSelectDay(day);
              }}
            />
          ))}

          {displayDay && (
            <>
              <div
                ref={lineRef}
                className="pointer-events-none absolute left-1 right-[11px] z-10 h-[2px] -translate-y-1/2 rounded-full bg-[var(--wa-accent)] lg:left-2 lg:right-[15px]"
                style={{ top: ratioToPercent(dayPosition(displayDay)) }}
              />
              <span
                ref={dotRef}
                className="pointer-events-none absolute right-[8px] z-10 h-2 w-2 -translate-y-1/2 rounded-full border border-white bg-[var(--wa-accent)] shadow lg:right-[12px]"
                style={{ top: ratioToPercent(dayPosition(displayDay)) }}
              />
              <div
                ref={labelWrapRef}
                className="pointer-events-none absolute left-1 right-7 z-20 flex -translate-y-1/2 justify-end lg:left-2 lg:right-10 xl:right-11"
                style={{ top: ratioToPercent(dayPosition(displayDay)) }}
              >
                <div className="max-w-full rounded-lg bg-white px-2.5 py-1.5 shadow-md ring-1 ring-black/8">
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
