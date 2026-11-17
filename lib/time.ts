import { DateTime } from "luxon";

/**
 * Shared Timezone Utilities.
 * Asia/Dhaka (UTC+6) is the single source of truth for company calendar days.
 * Never compute "which day it is" anywhere else.
 */
export const COMPANY_TIMEZONE = "Asia/Dhaka";

/** Luxon weekday numbers: Monday = 1 ... Sunday = 7. Weekend default is Friday only. */
export const DEFAULT_WEEKEND_DAYS = [5];

export type DateInput = Date | string | DateTime;

function toDhakaDateTime(input: DateInput): DateTime {
  if (DateTime.isDateTime(input)) {
    return input.setZone(COMPANY_TIMEZONE);
  }

  if (input instanceof Date) {
    const parsed = DateTime.fromJSDate(input, { zone: "utc" });
    if (!parsed.isValid) {
      throw new Error(`Invalid date: ${input.toISOString()}`);
    }
    return parsed.setZone(COMPANY_TIMEZONE);
  }

  // Strings without an offset are treated as UTC so the result never depends on
  // the machine's local timezone.
  const parsed = DateTime.fromISO(input, { zone: "utc" });
  if (!parsed.isValid) {
    throw new Error(`Invalid date: ${input}`);
  }
  return parsed.setZone(COMPANY_TIMEZONE);
}

/** Current instant as a Luxon DateTime in Asia/Dhaka. */
export function dhakaNow(): DateTime {
  return DateTime.now().setZone(COMPANY_TIMEZONE);
}

/** Current company calendar date as YYYY-MM-DD. */
export function dhakaToday(): string {
  return dhakaNow().toISODate()!;
}

/** Converts an instant (Date, ISO string, or DateTime) to its Asia/Dhaka calendar date (YYYY-MM-DD). */
export function toDhakaDate(date: DateInput): string {
  return toDhakaDateTime(date).toISODate()!;
}

/** True when both instants fall on the same Asia/Dhaka calendar day. */
export function isSameDhakaDay(a: DateInput, b: DateInput): boolean {
  return toDhakaDate(a) === toDhakaDate(b);
}

/**
 * True when the given instant falls on a configured weekend day.
 * `weekendDays` uses Luxon numbering (Monday = 1 ... Sunday = 7).
 */
export function isWeekend(
  date: DateInput = dhakaNow(),
  weekendDays: readonly number[] = DEFAULT_WEEKEND_DAYS,
): boolean {
  return weekendDays.includes(toDhakaDateTime(date).weekday);
}

/** Formats an instant as a Dhaka clock time, e.g. "9:05 PM". */
export function formatDhakaTime(date: DateInput): string {
  return toDhakaDateTime(date).toFormat("h:mm a");
}

/** Formats a date value as a Dhaka calendar date, e.g. "17 Nov 2026". */
export function formatDhakaDate(date: DateInput): string {
  return toDhakaDateTime(date).toFormat("dd LLL yyyy");
}

/** First instant of a Dhaka calendar date, as a UTC Date. */
export function dhakaDayStartUtc(dateString: string): Date {
  return DateTime.fromISO(dateString, { zone: COMPANY_TIMEZONE })
    .startOf("day")
    .toUTC()
    .toJSDate();
}

/** Last instant of a Dhaka calendar date, as a UTC Date. */
export function dhakaDayEndUtc(dateString: string): Date {
  return DateTime.fromISO(dateString, { zone: COMPANY_TIMEZONE })
    .endOf("day")
    .toUTC()
    .toJSDate();
}
