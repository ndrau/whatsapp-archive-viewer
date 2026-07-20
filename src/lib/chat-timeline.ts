export interface TimelineDay {
  key: string;
  date: Date;
  label: string;
  messageCount: number;
  startRatio: number;
  endRatio: number;
}

export interface TimelineYearMarker {
  key: string;
  year: number;
  ratio: number;
}

export interface TimelineMonthMarker {
  key: string;
  year: number;
  month: number;
  ratio: number;
  label: string;
}

export interface ChatTimelineModel {
  days: TimelineDay[];
  years: TimelineYearMarker[];
  months: TimelineMonthMarker[];
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

export function formatTimelineDay(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatTimelineMonth(year: number, month: number): string {
  return `${MONTH_LABELS[month]} ${year}`;
}

export function buildChatTimeline(
  groups: Array<{ key: string; label: string; messages: Array<{ date: Date }> }>,
): ChatTimelineModel {
  if (groups.length === 0) {
    return { days: [], years: [], months: [] };
  }

  const totalWeight = groups.reduce((sum, group) => sum + group.messages.length, 0);
  let cursor = 0;

  const days: TimelineDay[] = groups.map((group) => {
    const startRatio = cursor / totalWeight;
    cursor += group.messages.length;
    const endRatio = cursor / totalWeight;
    const date = new Date(group.messages[0].date);

    return {
      key: group.key,
      date,
      label: group.label,
      messageCount: group.messages.length,
      startRatio,
      endRatio,
    };
  });

  const years: TimelineYearMarker[] = [];
  const months: TimelineMonthMarker[] = [];
  const seenYears = new Set<number>();
  const seenMonths = new Set<string>();

  for (const day of days) {
    const year = day.date.getFullYear();
    const month = day.date.getMonth();

    if (!seenYears.has(year)) {
      seenYears.add(year);
      years.push({
        key: `year-${year}`,
        year,
        ratio: day.startRatio,
      });
    }

    const monthKey = `${year}-${month}`;
    if (!seenMonths.has(monthKey)) {
      seenMonths.add(monthKey);
      months.push({
        key: monthKey,
        year,
        month,
        ratio: day.startRatio,
        label: formatTimelineMonth(year, month),
      });
    }
  }

  return { days, years, months };
}

/** Soft inset inside the track so markers/labels don't sit flush at the edges. */
export const TIMELINE_EDGE_PADDING = 0.085;

/**
 * Map a data/content ratio (0–1 over the chat) into track coordinates.
 * Used for year/month markers and scroll-synced marker positions.
 */
export function dataRatioToTrackRatio(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  const min = TIMELINE_EDGE_PADDING;
  const max = 1 - TIMELINE_EDGE_PADDING;
  return min + clamped * (max - min);
}

/**
 * Inverse of {@link dataRatioToTrackRatio}: pointer/track Y (0–1 within the
 * track element) → data ratio used to resolve the day under the cursor.
 */
export function trackRatioToDataRatio(trackRatio: number): number {
  const clamped = Math.min(1, Math.max(0, trackRatio));
  const min = TIMELINE_EDGE_PADDING;
  const max = 1 - TIMELINE_EDGE_PADDING;
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (clamped - min) / (max - min)));
}

/**
 * Pointer/track Y is already in track space — convert directly to CSS %.
 * Do NOT run this through {@link dataRatioToTrackRatio} (that double-applies
 * edge padding and offsets the scrub marker from the cursor).
 */
export function trackRatioToCssPercent(trackRatio: number): number {
  return Math.min(1, Math.max(0, trackRatio)) * 100;
}

/**
 * Keep the scrub marker inside the content band (between edge paddings).
 * The mouse may enter the padding; the marker must stop at the padding edge.
 */
export function clampTrackRatioToContent(trackRatio: number): number {
  const min = TIMELINE_EDGE_PADDING;
  const max = 1 - TIMELINE_EDGE_PADDING;
  return Math.min(max, Math.max(min, Math.min(1, Math.max(0, trackRatio))));
}

/** CSS % for scrubbing: follows the pointer, but stops at the padding edges. */
export function scrubTrackRatioToCssPercent(trackRatio: number): number {
  return clampTrackRatioToContent(trackRatio) * 100;
}

export function dataRatioToCssPercent(ratio: number): number {
  return dataRatioToTrackRatio(ratio) * 100;
}

export function findTimelineDayAtRatio(
  days: TimelineDay[],
  ratio: number,
): TimelineDay | undefined {
  if (days.length === 0) return undefined;

  const clamped = Math.min(1, Math.max(0, ratio));
  const direct = days.find((day) => clamped >= day.startRatio && clamped < day.endRatio);
  if (direct) return direct;

  return days.at(-1);
}

export function findTimelineDayAtTrackRatio(
  days: TimelineDay[],
  trackRatio: number,
): TimelineDay | undefined {
  return findTimelineDayAtRatio(days, trackRatioToDataRatio(trackRatio));
}

export function findTimelineDayFromScroll(
  days: TimelineDay[],
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): TimelineDay | undefined {
  if (days.length === 0 || scrollHeight <= clientHeight) return days[0];

  const maxScroll = scrollHeight - clientHeight;
  const ratio = maxScroll <= 0 ? 0 : scrollTop / maxScroll;
  return findTimelineDayAtRatio(days, ratio);
}
