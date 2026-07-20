"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ChatTimelineModel,
  type TimelineDay,
  findTimelineDayAtRatio,
  formatTimelineDay,
} from "@/lib/chat-timeline";

interface ChatTimelineProps {
  model: ChatTimelineModel;
  activeDayKey?: string;
  onSelectDay: (day: TimelineDay) => void;
}

function ratioToPercent(ratio: number): string {
  return `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

export function ChatTimeline({ model, activeDayKey, onSelectDay }: ChatTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverDay, setHoverDay] = useState<TimelineDay | undefined>();
  const [isScrubbing, setIsScrubbing] = useState(false);

  const activeDay = useMemo(
    () => model.days.find((day) => day.key === activeDayKey) ?? model.days[0],
    [activeDayKey, model.days],
  );

  const displayDay = hoverDay ?? activeDay;

  const resolveDayFromPointer = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track || model.days.length === 0) return undefined;

      const rect = track.getBoundingClientRect();
      const ratio = (clientY - rect.top) / rect.height;
      return findTimelineDayAtRatio(model.days, ratio);
    },
    [model.days],
  );

  const handlePointer = useCallback(
    (clientY: number, select: boolean) => {
      const day = resolveDayFromPointer(clientY);
      if (!day) return;

      setHoverDay(day);
      if (select) onSelectDay(day);
    },
    [onSelectDay, resolveDayFromPointer],
  );

  useEffect(() => {
    if (!isScrubbing) return;

    function onMove(event: PointerEvent) {
      handlePointer(event.clientY, true);
    }

    function onUp() {
      setIsScrubbing(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [handlePointer, isScrubbing]);

  if (model.days.length === 0) return null;

  return (
    <aside className="relative hidden w-16 shrink-0 select-none md:block lg:w-20">
      <div
        ref={trackRef}
        className="timeline-track relative h-full cursor-pointer"
        onPointerDown={(event) => {
          setIsScrubbing(true);
          handlePointer(event.clientY, true);
        }}
        onPointerMove={(event) => {
          if (isScrubbing) return;
          handlePointer(event.clientY, false);
        }}
        onPointerLeave={() => {
          if (!isScrubbing) setHoverDay(undefined);
        }}
      >
        <div className="absolute inset-y-3 right-3 w-px bg-[var(--wa-muted)]/35" />

        {model.years.map((year) => (
          <button
            key={year.key}
            type="button"
            className="timeline-year absolute right-5 -translate-y-1/2 text-[11px] font-semibold leading-none text-[var(--wa-text)]/75 transition hover:text-[var(--wa-accent)]"
            style={{ top: ratioToPercent(year.ratio) }}
            onClick={(event) => {
              event.stopPropagation();
              const day = findTimelineDayAtRatio(model.days, year.ratio);
              if (day) onSelectDay(day);
            }}
          >
            {year.year}
          </button>
        ))}

        {model.months.map((month) => (
          <button
            key={month.key}
            type="button"
            aria-label={month.label}
            className="timeline-month absolute right-[11px] h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[var(--wa-muted)]/45 transition hover:scale-125 hover:bg-[var(--wa-accent)]"
            style={{ top: ratioToPercent(month.ratio) }}
            onClick={(event) => {
              event.stopPropagation();
              const day = findTimelineDayAtRatio(model.days, month.ratio);
              if (day) onSelectDay(day);
            }}
          />
        ))}

        {displayDay && (
          <>
            <span
              className="absolute right-2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--wa-accent)] shadow"
              style={{
                top: ratioToPercent((displayDay.startRatio + displayDay.endRatio) / 2),
              }}
            />
            <div
              className="pointer-events-none absolute right-8 z-20 -translate-y-1/2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-[var(--wa-text)] shadow-lg ring-1 ring-black/5"
              style={{
                top: ratioToPercent((displayDay.startRatio + displayDay.endRatio) / 2),
              }}
            >
              <p>{formatTimelineDay(displayDay.date)}</p>
              {isScrubbing && (
                <p className="mt-0.5 text-[10px] font-normal text-[var(--wa-muted)]">
                  Loslassen zum Springen
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
