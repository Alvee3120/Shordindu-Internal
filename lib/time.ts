import { DateTime } from "luxon";

/**
 * Shared Timezone Utilities.
 * Asia/Dhaka (UTC+6) is the single source of truth for company calendar days.
 * Full implementation & unit tests in Module 1.
 */
export const COMPANY_TIMEZONE = "Asia/Dhaka";

/**
 * Returns the current date in Asia/Dhaka as an ISO date string (YYYY-MM-DD).
 */
export function dhakaToday(): string {
  return DateTime.now().setZone(COMPANY_TIMEZONE).toISODate()!;
}

/**
 * Converts a Date or ISO string to Asia/Dhaka YYYY-MM-DD date string.
 */
export function toDhakaDate(date: Date | string): string {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: "utc" })
      : DateTime.fromJSDate(date, { zone: "utc" });
  return dt.setZone(COMPANY_TIMEZONE).toISODate()!;
}

/**
 * Checks if two dates fall on the exact same calendar day in Asia/Dhaka.
 */
export function isSameDhakaDay(a: Date | string, b: Date | string): boolean {
  return toDhakaDate(a) === toDhakaDate(b);
}
