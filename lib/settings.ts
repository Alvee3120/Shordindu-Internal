import { prisma } from "@/lib/db";
import { DEFAULT_DEPARTMENTS } from "@/lib/constants";
import { DEFAULT_WEEKEND_DAYS } from "@/lib/time";

/**
 * Reads a JSON-encoded setting, falling back to a default when it is missing
 * or unreadable.
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function getDepartments(): Promise<string[]> {
  const departments = await getSetting<string[]>(
    "departments",
    DEFAULT_DEPARTMENTS,
  );
  return Array.isArray(departments) && departments.length > 0
    ? departments
    : DEFAULT_DEPARTMENTS;
}

/** Luxon weekday numbers (Monday = 1 ... Sunday = 7). */
export async function getWeekendDays(): Promise<number[]> {
  const days = await getSetting<number[]>(
    "weekend_days",
    DEFAULT_WEEKEND_DAYS,
  );
  return Array.isArray(days) && days.length > 0 ? days : DEFAULT_WEEKEND_DAYS;
}

export async function setWeekendDays(days: number[]): Promise<void> {
  const value = JSON.stringify(days);
  await prisma.setting.upsert({
    where: { key: "weekend_days" },
    update: { value },
    create: { key: "weekend_days", value },
  });
}

const DEFAULT_REMINDER_TIME = "19:00";

/** Daily reminder time in Asia/Dhaka, formatted HH:MM. */
export async function getReminderTime(): Promise<string> {
  const value = await getSetting<string>("reminder_time", DEFAULT_REMINDER_TIME);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : DEFAULT_REMINDER_TIME;
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  const encoded = JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    update: { value: encoded },
    create: { key, value: encoded },
  });
}

export async function setDepartments(departments: string[]): Promise<void> {
  await saveSetting("departments", departments);
}

export async function setReminderTime(time: string): Promise<void> {
  await saveSetting("reminder_time", time);
}
