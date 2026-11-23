import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dhakaToday } from "@/lib/time";
import type { EmailAccount, EmailPriority } from "@/lib/email";

/**
 * Daily send allowance per provider account, measured on the Asia/Dhaka
 * calendar day. The counter lives in Postgres so it holds across processes and
 * workers; the claim is a single atomic statement, so two workers can never
 * take the same last slot.
 */

const DEFAULT_AUTH_LIMIT = 300;
const DEFAULT_BULK_LIMIT = 300;

/**
 * Slots "low" priority mail (notification digests) must leave for "normal"
 * mail (reminders). Without this, digests run every 15 minutes and consume the
 * whole bulk allowance before the 7 PM reminder ever runs.
 */
const DEFAULT_LOW_PRIORITY_RESERVE = 60;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/** Daily cap for the account. Zero disables the guard (development). */
export function emailQuotaLimit(account: EmailAccount): number {
  return account === "auth"
    ? envInt("EMAIL_AUTH_DAILY_LIMIT", DEFAULT_AUTH_LIMIT)
    : envInt("EMAIL_BULK_DAILY_LIMIT", DEFAULT_BULK_LIMIT);
}

function lowPriorityReserve(): number {
  return envInt("EMAIL_LOW_PRIORITY_RESERVE", DEFAULT_LOW_PRIORITY_RESERVE);
}

/**
 * Atomically reserves one send for today. Returns false when the account has
 * no allowance left, in which case nothing was sent and the caller should
 * defer the message rather than treat it as a failure.
 */
export async function claimEmailSlot(
  account: EmailAccount,
  limit: number,
  priority: EmailPriority,
): Promise<boolean> {
  if (limit <= 0) return true;

  const ceiling =
    priority === "low" ? Math.max(0, limit - lowPriorityReserve()) : limit;
  if (ceiling <= 0) return false;

  const day = new Date(`${dhakaToday()}T00:00:00.000Z`);

  // ON CONFLICT makes the check-and-increment atomic, so concurrent workers
  // cannot both claim the same final slot. No row returned means "no room".
  const rows = await prisma.$queryRaw<{ used: number }[]>(Prisma.sql`
    INSERT INTO "email_account_usage" ("account", "day", "used")
    VALUES (${account}, ${day}, 1)
    ON CONFLICT ("account", "day") DO UPDATE
      SET "used" = "email_account_usage"."used" + 1
      WHERE "email_account_usage"."used" < ${ceiling}
    RETURNING "used"
  `);
  return rows.length > 0;
}

/** Sends already counted for the account today. */
export async function emailUsageToday(account: EmailAccount): Promise<number> {
  const day = new Date(`${dhakaToday()}T00:00:00.000Z`);
  const row = await prisma.emailAccountUsage.findUnique({
    where: { account_day: { account, day } },
    select: { used: true },
  });
  return row?.used ?? 0;
}

/**
 * Slots left today for the account, without reserving any. Reminder jobs use
 * this to size their batch so the recorded run reflects what was actually
 * queued. The worker still claims each slot atomically at send time, so this
 * is a budget, not a guarantee.
 */
export async function emailQuotaRemaining(
  account: EmailAccount,
  priority: EmailPriority = "normal",
): Promise<number> {
  const limit = emailQuotaLimit(account);
  if (limit <= 0) return Number.POSITIVE_INFINITY;

  const ceiling =
    priority === "low" ? Math.max(0, limit - lowPriorityReserve()) : limit;
  const used = await emailUsageToday(account);
  return Math.max(0, ceiling - used);
}
