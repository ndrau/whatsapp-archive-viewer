export function dayKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayKeyFromIso(iso: string): string {
  return dayKeyFromDate(new Date(iso));
}

export function chunkIdFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function selectDayWindow<T extends { key: string }>(
  days: T[],
  centerDayKey: string | undefined,
  radius: number,
): T[] {
  if (days.length === 0) return [];

  const centerIndex =
    centerDayKey === undefined
      ? days.length - 1
      : days.findIndex((day) => day.key === centerDayKey);

  const resolvedIndex = centerIndex === -1 ? days.length - 1 : centerIndex;
  const start = Math.max(0, resolvedIndex - radius);
  const end = Math.min(days.length, resolvedIndex + radius + 1);

  return days.slice(start, end);
}

export function selectDayRange<T extends { key: string }>(
  days: T[],
  fromDayKey: string,
  toDayKey: string,
): T[] {
  if (days.length === 0) return [];

  const fromIndex = days.findIndex((day) => day.key === fromDayKey);
  const toIndex = days.findIndex((day) => day.key === toDayKey);

  if (fromIndex === -1 || toIndex === -1) return [];

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);

  return days.slice(start, end + 1);
}

export const DEFAULT_DAY_RADIUS = 7;

/** Max days kept in the chat viewer DOM to avoid unbounded memory growth. */
export const MAX_LOADED_DAYS = 45;
