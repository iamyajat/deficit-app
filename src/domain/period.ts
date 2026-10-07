import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import type { ISODate, Period, WeekStart } from './types';

/** Parse `YYYY-MM-DD` as a *local* date (midnight local time). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

/** Start date of the period containing `date`. Periods are identified by their start date. */
export function periodStart(date: ISODate, period: Period, weekStartsOn: WeekStart): ISODate {
  const d = parseISODate(date);
  switch (period) {
    case 'day':
      return date;
    case 'week':
      return toISODate(startOfWeek(d, { weekStartsOn }));
    case 'month':
      return toISODate(startOfMonth(d));
    case 'year':
      return toISODate(startOfYear(d));
  }
}

/** Start of the period after the one starting at `start`. */
export function nextPeriodStart(start: ISODate, period: Period): ISODate {
  return shiftPeriods(start, period, 1);
}

export function shiftPeriods(start: ISODate, period: Period, n: number): ISODate {
  const d = parseISODate(start);
  switch (period) {
    case 'day':
      return toISODate(addDays(d, n));
    case 'week':
      return toISODate(addWeeks(d, n));
    case 'month':
      return toISODate(addMonths(d, n));
    case 'year':
      return toISODate(addYears(d, n));
  }
}

/** Last day (inclusive) of the period starting at `start`. */
export function periodEnd(start: ISODate, period: Period): ISODate {
  return toISODate(addDays(parseISODate(nextPeriodStart(start, period)), -1));
}

/** Number of whole periods from period-start `a` to period-start `b` (b - a). */
export function periodsBetween(a: ISODate, b: ISODate, period: Period): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  switch (period) {
    case 'day':
      return differenceInCalendarDays(db, da);
    case 'week':
      return Math.round(differenceInCalendarDays(db, da) / 7);
    case 'month':
      return differenceInCalendarMonths(db, da);
    case 'year':
      return differenceInCalendarYears(db, da);
  }
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseISODate(b), parseISODate(a));
}

const PERIOD_NOUN: Record<Period, string> = {
  day: 'today',
  week: 'this week',
  month: 'this month',
  year: 'this year',
};

const PERIOD_ADJ: Record<Period, string> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

export function currentPeriodLabel(period: Period): string {
  return PERIOD_NOUN[period];
}

export function periodAdjective(period: Period): string {
  return PERIOD_ADJ[period];
}

export function formatPeriod(start: ISODate, period: Period): string {
  const d = parseISODate(start);
  switch (period) {
    case 'day':
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    case 'week': {
      const end = parseISODate(periodEnd(start, period));
      const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      return `${d.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
    }
    case 'month':
      return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    case 'year':
      return String(d.getFullYear());
  }
}
