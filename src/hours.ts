import type { DayKey, HoursConfig, TimeRange } from './config/schema.js';

// Sunday-indexed to match Intl's "weekday" part decoding below.
const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_TO_IDX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayIdx: number;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // some ICU builds render midnight as "24" even under h23; normalize.
    hour: map.hour === '24' ? 0 : Number(map.hour),
    minute: Number(map.minute),
    weekdayIdx: WEEKDAY_TO_IDX[map.weekday] ?? 0,
  };
}

function dateStrOf(p: ZonedParts): string {
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// Offset (in minutes, ADDED to a UTC instant to get the zone's local wall
// clock) in effect for `approx` in `timeZone`, read via Intl's longOffset
// name (e.g. "GMT-04:00" -> -240). One DST-aware lookup, not a fixed table.
function offsetMinutesAt(approx: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset', hour: '2-digit' });
  const part = dtf.formatToParts(approx).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

// Converts a LOCAL wall-clock date+time in `timeZone` to the UTC instant it
// represents — the inverse of getZonedParts. This is what lets callers (an
// AI assistant relaying "11am this Sunday, business's own time") skip UTC
// offset arithmetic entirely, which is exactly the arithmetic that produces
// silently-wrong-but-plausible answers when done wrong by a caller.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  // First pass: treat the wall-clock fields as if they were UTC, to get an
  // instant close enough in time to look up the real offset in effect.
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  let offset = offsetMinutesAt(new Date(guess), timeZone);
  let utc = guess - offset * 60_000;
  // Second pass: re-derive the offset from the refined instant, in case the
  // first guess landed on the wrong side of a DST transition.
  const offset2 = offsetMinutesAt(new Date(utc), timeZone);
  if (offset2 !== offset) {
    utc = guess - offset2 * 60_000;
  }
  return new Date(utc);
}

function rangesForDate(hours: HoursConfig, dateStr: string, dayKey: DayKey): TimeRange[] {
  const exception = hours.exceptions.find((e) => e.date === dateStr);
  if (exception) {
    if (exception.closed) return [];
    return exception.ranges ?? [];
  }
  return hours.schedule[dayKey] ?? [];
}

export interface NextChange {
  type: 'opens' | 'closes';
  date: string;
  time: string;
}

export interface OpenStatus {
  open: boolean;
  timezone: string;
  localTime: string;
  dayOfWeek: DayKey;
  todayRanges: TimeRange[];
  nextChange: NextChange | null;
}

export function getOpenStatus(hours: HoursConfig, at: Date = new Date()): OpenStatus {
  const zone = hours.timezone;
  const todayParts = getZonedParts(at, zone);
  const todayDateStr = dateStrOf(todayParts);
  const todayKey = DAY_ORDER[todayParts.weekdayIdx];
  const yestParts = getZonedParts(new Date(at.getTime() - 24 * 60 * 60 * 1000), zone);
  const yestDateStr = dateStrOf(yestParts);
  const yestKey = DAY_ORDER[yestParts.weekdayIdx];

  const todayRanges = rangesForDate(hours, todayDateStr, todayKey);
  const yestRanges = rangesForDate(hours, yestDateStr, yestKey);
  const nowMinutes = todayParts.hour * 60 + todayParts.minute;
  const localTime = `${todayDateStr}T${pad(todayParts.hour)}:${pad(todayParts.minute)}`;

  // Same-day ranges, including the late portion of an overnight range that
  // started today (e.g. open 22:00 close 02:00 -> open from 22:00 to 24:00).
  for (const r of todayRanges) {
    const o = minutesOf(r.open);
    const c = minutesOf(r.close);
    const overnight = c <= o;
    if (!overnight && nowMinutes >= o && nowMinutes < c) {
      return { open: true, timezone: zone, localTime, dayOfWeek: todayKey, todayRanges, nextChange: { type: 'closes', date: todayDateStr, time: r.close } };
    }
    if (overnight && nowMinutes >= o) {
      // Closing time technically lands "tomorrow" on the clock; report tomorrow's date.
      const tomorrow = getZonedParts(new Date(at.getTime() + 24 * 60 * 60 * 1000), zone);
      return { open: true, timezone: zone, localTime, dayOfWeek: todayKey, todayRanges, nextChange: { type: 'closes', date: dateStrOf(tomorrow), time: r.close } };
    }
  }
  // Overnight bleed from yesterday's range into this morning.
  for (const r of yestRanges) {
    const o = minutesOf(r.open);
    const c = minutesOf(r.close);
    const overnight = c <= o;
    if (overnight && nowMinutes < c) {
      return { open: true, timezone: zone, localTime, dayOfWeek: todayKey, todayRanges, nextChange: { type: 'closes', date: todayDateStr, time: r.close } };
    }
  }

  // Closed right now — find the next opening within the next 8 days.
  for (let offset = 0; offset <= 8; offset++) {
    const d = new Date(at.getTime() + offset * 24 * 60 * 60 * 1000);
    const p = getZonedParts(d, zone);
    const dateStr = dateStrOf(p);
    const key = DAY_ORDER[p.weekdayIdx];
    const ranges = rangesForDate(hours, dateStr, key);
    for (const r of ranges) {
      const o = minutesOf(r.open);
      if (offset === 0 && o <= nowMinutes) continue; // already passed today
      return { open: false, timezone: zone, localTime, dayOfWeek: todayKey, todayRanges, nextChange: { type: 'opens', date: dateStr, time: r.open } };
    }
  }
  return { open: false, timezone: zone, localTime, dayOfWeek: todayKey, todayRanges, nextChange: null };
}
