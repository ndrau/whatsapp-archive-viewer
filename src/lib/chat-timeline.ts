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

export const TIMELINE_EDGE_PADDING = 0.045;

export function dataRatioToTrackRatio(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  const min = TIMELINE_EDGE_PADDING;
  const max = 1 - TIMELINE_EDGE_PADDING;
  return min + clamped * (max - min);
}

export function trackRatioToDataRatio(trackRatio: number): number {
  const clamped = Math.min(1, Math.max(0, trackRatio));
  const min = TIMELINE_EDGE_PADDING;
  const max = 1 - TIMELINE_EDGE_PADDING;
  return Math.min(1, Math.max(0, (clamped - min) / (max - min)));
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
