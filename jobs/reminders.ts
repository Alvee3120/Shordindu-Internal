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
  buildDailyReminderEmail,
  type EmailPayload,
} from "@/lib/email";

export type ReminderSender = (payload: EmailPayload) => Promise<unknown>;

export const DAILY_REMINDER_JOB = "daily-update-reminder";
export const ASSIGNMENT_DUE_JOB = "assignment-due-reminder";

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

/** Claims today's run; false when it has already been claimed. */
async function claimRun(job: string, runDate: Date): Promise<boolean> {
  const existing = await prisma.jobRun.findUnique({
    where: { job_runDate: { job, runDate } },
    select: { id: true },
  });
  if (existing) return false;

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

/**
 * Emails everyone who is Active, not on leave and has not posted today.
 * Skips weekends and holidays. Idempotent per Dhaka date.
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
    const users = summary.missing.length
      ? await prisma.user.findMany({
          where: {
            id: { in: summary.missing.map((user) => user.id) },
            status: UserStatus.Active,
          },
          select: { id: true, name: true, email: true },
        })
      : [];

    for (const user of users) {
      await send(buildDailyReminderEmail({ to: user.email, name: user.name, date: today }));
    }

    await finishRun(DAILY_REMINDER_JOB, runDate, "completed", users.length);

    return {
      status: "completed",
      recipients: users,
      emailCount: users.length,
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

    const recipients = new Map<string, ReminderRecipient>();
    let emailCount = 0;

    for (const assignment of assignments) {
      const summary = extractPlainText(assignment.contentHtml);
      const link = `${appUrl()}/assignments#assignment-${assignment.id}`;

      for (const assignee of assignment.assignees) {
        await send(
          buildAssignmentDueEmail({
            to: assignee.user.email,
            name: assignee.user.name,
            summary,
            link,
          }),
        );
        recipients.set(assignee.user.id, assignee.user);
        emailCount++;
      }
    }

    await finishRun(ASSIGNMENT_DUE_JOB, runDate, "completed", emailCount);

    return {
      status: "completed",
      recipients: Array.from(recipients.values()),
      emailCount,
    };
  } catch (error) {
    await finishRun(ASSIGNMENT_DUE_JOB, runDate, "failed", 0);
    throw error;
  }
}
