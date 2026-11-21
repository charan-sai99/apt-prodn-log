import { TZDate } from "@date-fns/tz";
import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns";
import { DEFAULT_FACTORY_TIMEZONE } from "./env";
import type { Shift } from "./types";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Current wall-clock date and hour at the factory. */
export function factoryNow(timezone = DEFAULT_FACTORY_TIMEZONE, now: Date = new Date()) {
  const local = new TZDate(now.getTime(), timezone);
  return {
    date: format(local, "yyyy-MM-dd"),
    hour: local.getHours(),
    minute: local.getMinutes(),
  };
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = parseISO(value);
  return !Number.isNaN(d.getTime()) && format(d, "yyyy-MM-dd") === value;
}

export function shiftIsoDate(isoDate: string, days: number): string {
  return format(addDays(parseISO(isoDate), days), "yyyy-MM-dd");
}

/** "08:00–09:00" */
export function formatHourSlot(hour: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}:00–${pad((hour + 1) % 24)}:00`;
}

export function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "EEE d MMM yyyy");
}

export function formatTimestamp(iso: string, timezone = DEFAULT_FACTORY_TIMEZONE): string {
  return format(new TZDate(new Date(iso).getTime(), timezone), "d MMM yyyy, HH:mm");
}

/** Mirrors public.shift_for_hour() in the database. */
export function shiftForHour(shifts: Shift[], hour: number): string | null {
  const active = [...shifts]
    .filter((s) => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  for (const s of active) {
    const wraps = s.start_hour >= s.end_hour;
    if (!wraps && hour >= s.start_hour && hour < s.end_hour) return s.code;
    if (wraps && (hour >= s.start_hour || hour < s.end_hour)) return s.code;
  }
  return null;
}

export function hoursOfShift(shift: Shift): number[] {
  const hours: number[] = [];
  let h = shift.start_hour;
  do {
    hours.push(h);
    h = (h + 1) % 24;
  } while (h !== shift.end_hour);
  return hours;
}

/**
 * Hours an operator may still select for a date: every hour for past dates,
 * up to and including the current hour today, none for future dates.
 * (Legacy rule: production time cannot be in the future.)
 */
export function selectableHours(isoDate: string, timezone = DEFAULT_FACTORY_TIMEZONE, now: Date = new Date()): number[] {
  const { date, hour } = factoryNow(timezone, now);
  if (isoDate > date) return [];
  const last = isoDate === date ? hour : 23;
  return Array.from({ length: last + 1 }, (_, i) => i);
}

/** Dates an operator may submit for: today and the allowed back-dated days. */
export function operatorAllowedDates(backdateDays: number, timezone = DEFAULT_FACTORY_TIMEZONE, now: Date = new Date()): string[] {
  const { date } = factoryNow(timezone, now);
  return Array.from({ length: backdateDays + 1 }, (_, i) => shiftIsoDate(date, -i));
}

export type ReportPeriod = "daily" | "weekly" | "monthly";

/** Inclusive date range for a report period containing `anchor` (weeks start Monday). */
export function periodRange(period: ReportPeriod, anchor: string): { from: string; to: string } {
  const d = parseISO(anchor);
  if (period === "daily") return { from: anchor, to: anchor };
  if (period === "weekly") {
    const start = startOfWeek(d, { weekStartsOn: 1 });
    return { from: format(start, "yyyy-MM-dd"), to: format(addDays(start, 6), "yyyy-MM-dd") };
  }
  return { from: format(startOfMonth(d), "yyyy-MM-dd"), to: format(endOfMonth(d), "yyyy-MM-dd") };
}

export function lastNDays(n: number, today: string): { from: string; to: string } {
  return { from: format(subDays(parseISO(today), n - 1), "yyyy-MM-dd"), to: today };
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = shiftIsoDate(d, 1)) out.push(d);
  return out;
}
