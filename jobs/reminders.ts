import {
  AssignmentStatus,
  AssigneeStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { dhakaToday } from "@/lib/time";
import { getNotSubmittedToday } from "@/lib/attendance";
import { extractPlainText } from "@/lib/sanitize";
import {
  appUrl,
  buildAssignmentDueEmail,
  buildCalendarReminderEmail,
  buildDailyReminderEmail,
  EmailQuotaExceededError,
  type EmailPayload,
} from "@/lib/email";
import { emailQuotaRemaining } from "@/lib/email-quota";
import {
  dueCalendarEvents,
  markCalendarReminded,
} from "@/lib/calendar";

const BULK_ACCOUNT = "bulk" as const;

export type ReminderSender = (payload: EmailPayload) => Promise<unknown>;

export const DAILY_REMINDER_JOB = "daily-update-reminder";
export const ASSIGNMENT_DUE_JOB = "assignment-due-reminder";
export const CALENDAR_REMINDER_JOB = "calendar-reminder";

export interface ReminderRecipient {
  id: string;
  name: string;
  email: string;
}

export interface ReminderResult {
  status: "completed" | "skipped" | "already_ran";
  recipients: ReminderRecipient[];
  emailCount: number;
  detail?: string;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Claims today's run; false when it has already been claimed.
 *
 * A run left "failed" by a crashed worker may be claimed again, otherwise one
 * bad night would permanently mark that day as done.
 */
async function claimRun(job: string, runDate: Date): Promise<boolean> {
  const existing = await prisma.jobRun.findUnique({
    where: { job_runDate: { job, runDate } },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status !== "failed") return false;
    await prisma.jobRun.update({
      where: { id: existing.id },
      data: { status: "running", detail: null, recipientCount: 0 },
    });
    return true;
  }

  try {
    await prisma.jobRun.create({
      data: { job, runDate, status: "running" },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

async function finishRun(
  job: string,
  runDate: Date,
  status: string,
  recipientCount: number,
  detail?: string | null,
): Promise<void> {
  await prisma.jobRun.update({
    where: { job_runDate: { job, runDate } },
    data: { status, recipientCount, detail: detail ?? null },
  });
}

async function skipRun(
  job: string,
  runDate: Date,
  detail: string,
): Promise<boolean> {
  const existing = await prisma.jobRun.findUnique({
    where: { job_runDate: { job, runDate } },
    select: { id: true },
  });
  if (existing) return false;

  try {
    await prisma.jobRun.create({
      data: { job, runDate, status: "skipped", detail },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export interface ReminderBatchItem {
  /** Row id this email belongs to (calendar entry, assignment, user). */
  id: string;
  recipient: ReminderRecipient;
  payload: EmailPayload;
}

export interface ReminderBatchResult {
  /** Items whose email was handed off successfully. */
  delivered: ReminderBatchItem[];
  quotaSkipped: number;
  failed: number;
  /** Human-readable reason for the counts, or null when everything went out. */
  detail: string | null;
}

/**
 * Reminders are enqueued, not sent inline, so the daily cap is checked here to
 * size the batch. Anything beyond today's remaining allowance is skipped and
 * counted, instead of being queued only to be dropped by the worker.
 */
async function takeWithinQuota(
  items: ReminderBatchItem[],
): Promise<{ items: ReminderBatchItem[]; skipped: number }> {
  const remaining = await emailQuotaRemaining(BULK_ACCOUNT);
  if (remaining >= items.length) return { items, skipped: 0 };
  return {
    items: items.slice(0, remaining),
    skipped: items.length - remaining,
  };
}

/**
 * Sends reminder emails one by one without letting a single failure abort the
 * batch. Stops at the daily quota (nothing is lost by trying again) and keeps
 * going past a single recipient's error so everyone else still gets theirs.
 */
async function deliverReminders(
  send: ReminderSender,
  items: ReminderBatchItem[],
): Promise<ReminderBatchResult> {
  const { items: allowed, skipped } = await takeWithinQuota(items);
  const delivered: ReminderBatchItem[] = [];
  let quotaSkipped = skipped;
  let failed = 0;

  for (let index = 0; index < allowed.length; index++) {
    const item = allowed[index]!;
    try {
      await send(item.payload);
      delivered.push(item);
    } catch (error) {
      if (error instanceof EmailQuotaExceededError) {
        quotaSkipped += allowed.length - index;
        break;
      }
      failed++;
      console.error(
        `[reminders] Could not send to ${item.recipient.email}`,
        error,
      );
    }
  }

  const parts: string[] = [];
  if (quotaSkipped > 0) parts.push(`${quotaSkipped} skipped: daily email quota reached`);
  if (failed > 0) parts.push(`${failed} failed`);

  return {
    delivered,
    quotaSkipped,
    failed,
    detail: parts.length > 0 ? parts.join(", ") : null,
  };
}

/**
 * Emails everyone who is Active, not on leave and has not posted today.
 * Skips weekends and holidays. Idempotent per Dhaka date.
 *
 * The bulk account has a daily cap. When the cap is reached mid-run the
 * remaining reminders are skipped and the count is recorded on the run, so an
 * admin can see why some people were not emailed.
 */
export async function runDailyUpdateReminder(
  send: ReminderSender,
): Promise<ReminderResult> {
  const today = dhakaToday();
  const runDate = parseDateOnly(today);
  const summary = await getNotSubmittedToday();

  if (!summary.isWorkingDay) {
    const detail =
      summary.reason === "holiday"
        ? `holiday: ${summary.holidayName}`
        : "weekend";
    const claimed = await skipRun(DAILY_REMINDER_JOB, runDate, detail);
    return {
      status: claimed ? "skipped" : "already_ran",
      recipients: [],
      emailCount: 0,
      detail,
    };
  }

  if (!(await claimRun(DAILY_REMINDER_JOB, runDate))) {
    return { status: "already_ran", recipients: [], emailCount: 0 };
  }

  try {
    const candidates = summary.missing.length
      ? await prisma.user.findMany({
          where: {
            id: { in: summary.missing.map((user) => user.id) },
            status: UserStatus.Active,
          },
          select: { id: true, name: true, email: true },
        })
      : [];

    const batch = await deliverReminders(
      send,
      candidates.map((user) => ({
        id: user.id,
        recipient: user,
        payload: buildDailyReminderEmail({
          to: user.email,
          name: user.name,
          date: today,
        }),
      })),
    );

    await finishRun(
      DAILY_REMINDER_JOB,
      runDate,
      batch.failed > 0 && batch.delivered.length === 0 ? "failed" : "completed",
      batch.delivered.length,
      batch.detail,
    );

    return {
      status: "completed",
      recipients: batch.delivered.map((item) => item.recipient),
      emailCount: batch.delivered.length,
      detail: batch.detail ?? undefined,
    };
  } catch (error) {
    await finishRun(DAILY_REMINDER_JOB, runDate, "failed", 0);
    throw error;
  }
}

/**
 * Emails assignees whose assignment is due today and is still open.
 * Idempotent per Dhaka date.
 */
export async function runAssignmentDueReminder(
  send: ReminderSender,
): Promise<ReminderResult> {
  const today = dhakaToday();
  const runDate = parseDateOnly(today);

  if (!(await claimRun(ASSIGNMENT_DUE_JOB, runDate))) {
    return { status: "already_ran", recipients: [], emailCount: 0 };
  }

  try {
    const assignments = await prisma.assignment.findMany({
      where: {
        deletedAt: null,
        status: AssignmentStatus.open,
        dueDate: runDate,
      },
      select: {
        id: true,
        contentHtml: true,
        assignees: {
          where: {
            removedAt: null,
            status: { not: AssigneeStatus.done },
            user: { status: UserStatus.Active },
          },
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const items: ReminderBatchItem[] = [];
    for (const assignment of assignments) {
      const summary = extractPlainText(assignment.contentHtml);
      const link = `${appUrl()}/assignments#assignment-${assignment.id}`;

      for (const assignee of assignment.assignees) {
        items.push({
          id: assignment.id,
          recipient: assignee.user,
          payload: buildAssignmentDueEmail({
            to: assignee.user.email,
            name: assignee.user.name,
            summary,
            link,
          }),
        });
      }
    }

    const batch = await deliverReminders(send, items);
    const recipients = new Map<string, ReminderRecipient>();
    for (const item of batch.delivered) {
      recipients.set(item.recipient.id, item.recipient);
    }

    await finishRun(
      ASSIGNMENT_DUE_JOB,
      runDate,
      batch.failed > 0 && batch.delivered.length === 0 ? "failed" : "completed",
      batch.delivered.length,
      batch.detail,
    );

    return {
      status: "completed",
      recipients: Array.from(recipients.values()),
      emailCount: batch.delivered.length,
      detail: batch.detail ?? undefined,
    };
  } catch (error) {
    await finishRun(ASSIGNMENT_DUE_JOB, runDate, "failed", 0);
    throw error;
  }
}

/**
 * Emails each user whose own calendar entry falls today and has not been
 * reminded yet. Idempotent at two levels: the per-day job run and the
 * per-entry `remindedAt` marker, so a retry never double-sends.
 */
export async function runCalendarReminder(
  send: ReminderSender,
): Promise<ReminderResult> {
  const today = dhakaToday();
  const runDate = parseDateOnly(today);

  if (!(await claimRun(CALENDAR_REMINDER_JOB, runDate))) {
    return { status: "already_ran", recipients: [], emailCount: 0 };
  }

  try {
    const events = await dueCalendarEvents(today);
    const link = `${appUrl()}/calendar`;

    const batch = await deliverReminders(
      send,
      events.map((event) => ({
        id: event.id,
        recipient: event.user,
        payload: buildCalendarReminderEmail({
          to: event.user.email,
          name: event.user.name,
          title: event.title,
          notes: event.notes,
          link,
        }),
      })),
    );

    // Only mark entries that actually sent; quota-skipped entries stay
    // unmarked so they are not lost if the job runs again today.
    await markCalendarReminded(batch.delivered.map((item) => item.id));

    const recipients = new Map<string, ReminderRecipient>();
    for (const item of batch.delivered) {
      recipients.set(item.recipient.id, item.recipient);
    }

    await finishRun(
      CALENDAR_REMINDER_JOB,
      runDate,
      batch.failed > 0 && batch.delivered.length === 0 ? "failed" : "completed",
      batch.delivered.length,
      batch.detail,
    );

    return {
      status: "completed",
      recipients: Array.from(recipients.values()),
      emailCount: batch.delivered.length,
      detail: batch.detail ?? undefined,
    };
  } catch (error) {
    await finishRun(CALENDAR_REMINDER_JOB, runDate, "failed", 0);
    throw error;
  }
}
