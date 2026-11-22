import type { DateRange } from './types.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Pacific Time — the timezone Search Console reports in. */
export function todayInPacific(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: string, days: number): string {
  if (!ISO_DATE.test(date)) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD.`);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Two back-to-back windows of `days` days, the current one ending on `latest`. */
export function comparisonWindows(latest: string, days: number): { current: DateRange; previous: DateRange } {
  const current = { start: addDays(latest, -(days - 1)), end: latest };
  const previous = { start: addDays(current.start, -days), end: addDays(current.start, -1) };
  return { current, previous };
}

export function formatRange(range: DateRange): string {
  return `${range.start} → ${range.end}`;
}
