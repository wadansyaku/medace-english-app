export const APP_TIME_ZONE = 'Asia/Tokyo';
export const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const WEEKDAY_LABEL_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
});

const getPartsMap = (value: Date): Record<string, string> => {
  return DATE_KEY_FORMATTER.formatToParts(value).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
    return parts;
  }, {});
};

export const formatDateKey = (value: Date | number): string => {
  const date = typeof value === 'number' ? new Date(value) : value;
  const parts = getPartsMap(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const formatMonthKey = (value: Date | number): string => {
  return formatDateKey(value).slice(0, 7);
};

export const getTokyoMonthRange = (monthKey: string): { start: number; end: number } => {
  const [year, month] = monthKey.split('-').map(Number);
  return {
    start: Date.UTC(year, month - 1, 1, -9, 0, 0, 0),
    end: Date.UTC(year, month, 1, -9, 0, 0, 0),
  };
};

export const getTodayDateKey = (): string => formatDateKey(new Date());

export const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

export const shiftDateKey = (dateKey: string, days: number): string => {
  const shifted = parseDateKey(dateKey);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return formatDateKey(shifted);
};

export const getRelativeDateKey = (days: number, base: Date | number = new Date()): string => {
  return shiftDateKey(formatDateKey(base), days);
};

export const getDateKeyWeekdayLabel = (dateKey: string): string => {
  return WEEKDAY_LABEL_FORMATTER.format(parseDateKey(dateKey));
};
