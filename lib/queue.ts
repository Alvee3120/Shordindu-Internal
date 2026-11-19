import { PgBoss, type Job } from "pg-boss";
import { sendEmail, type EmailPayload } from "@/lib/email";
import { processPendingDigests } from "@/jobs/digest";
import {
  runAssignmentDueReminder,
  runCalendarReminder,
  runDailyUpdateReminder,
  type ReminderSender,
} from "@/jobs/reminders";
import { getReminderTime } from "@/lib/settings";
import { COMPANY_TIMEZONE } from "@/lib/time";
import { CALENDAR_REMINDER_TIME } from "@/lib/calendar";

const EMAIL_QUEUE = "email.send";
const DIGEST_QUEUE = "notifications.digest";
const DAILY_REMINDER_QUEUE = "reminders.daily-update";
const ASSIGNMENT_DUE_QUEUE = "reminders.assignment-due";
const CALENDAR_REMINDER_QUEUE = "reminders.calendar";

const globalForBoss = globalThis as unknown as {
  shordinduBoss?: Promise<PgBoss>;
};

/** Converts the stored HH:MM Dhaka time into a cron expression. */
export function cronForReminderTime(time: string): string {
  const [hour = "19", minute = "0"] = time.split(":");
  return `${Number(minute)} ${Number(hour)} * * *`;
}

async function scheduleReminders(boss: PgBoss): Promise<void> {
  await boss.schedule(
    DAILY_REMINDER_QUEUE,
    cronForReminderTime(await getReminderTime()),
    {},
    { tz: COMPANY_TIMEZONE },
  );
  await boss.schedule(ASSIGNMENT_DUE_QUEUE, "0 9 * * *", {}, {
    tz: COMPANY_TIMEZONE,
  });
  // Calendar reminders go out mid-morning on the day the entry is due.
  const [calendarHour, calendarMinute] = CALENDAR_REMINDER_TIME.split(":");
  await boss.schedule(
    CALENDAR_REMINDER_QUEUE,
    `${Number(calendarMinute)} ${Number(calendarHour)} * * *`,
    {},
    { tz: COMPANY_TIMEZONE },
  );
}

async function bootstrap(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });

  boss.on("error", (error: unknown) => {
    console.error("[pg-boss]", error);
  });

  await boss.start();
  await boss.createQueue(EMAIL_QUEUE, {
    retryLimit: 3,
    retryDelay: 60,
    expireInSeconds: 120,
  });
  await boss.createQueue(DIGEST_QUEUE, {
    retryLimit: 2,
    retryDelay: 120,
    expireInSeconds: 300,
  });
  await boss.createQueue(DAILY_REMINDER_QUEUE, {
    retryLimit: 2,
    retryDelay: 300,
    expireInSeconds: 300,
  });
  await boss.createQueue(ASSIGNMENT_DUE_QUEUE, {
    retryLimit: 2,
    retryDelay: 300,
    expireInSeconds: 300,
  });
  await boss.createQueue(CALENDAR_REMINDER_QUEUE, {
    retryLimit: 2,
    retryDelay: 300,
    expireInSeconds: 300,
  });

  const sendQueued: ReminderSender = async (payload) => {
    await boss.send(EMAIL_QUEUE, payload);
  };

  await boss.work<EmailPayload>(
    EMAIL_QUEUE,
    async (jobs: Job<EmailPayload>[]) => {
      for (const job of jobs) {
        await sendEmail(job.data);
      }
    },
  );

  await boss.work(DIGEST_QUEUE, async (_jobs: Job<object>[]) => {
    await processPendingDigests();
  });

  await boss.work(DAILY_REMINDER_QUEUE, async () => {
    await runDailyUpdateReminder(sendQueued);
  });

  await boss.work(ASSIGNMENT_DUE_QUEUE, async () => {
    await runAssignmentDueReminder(sendQueued);
  });

  await boss.work(CALENDAR_REMINDER_QUEUE, async () => {
    await runCalendarReminder(sendQueued);
  });

  // Batch notification emails every 15 minutes.
  await boss.schedule(DIGEST_QUEUE, "*/15 * * * *");

  await scheduleReminders(boss);

  return boss;
}

/**
 * Single pg-boss instance per process. Workers run inside the Node server so
 * a single deployment is enough; scaling later can move this to a worker.
 */
export async function getBoss(): Promise<PgBoss> {
  globalForBoss.shordinduBoss ??= bootstrap();
  return globalForBoss.shordinduBoss;
}

/**
 * Under test there is no running worker, so queueing would leave jobs stranded
 * in the pgboss tables for a dev server to pick up later — which is exactly how
 * a test announcement ends up emailing the whole company.
 *
 * Vitest sets VITEST=true; it does not set NODE_ENV=test (Next forces
 * "production"), so this checks the vitest flag rather than NODE_ENV.
 */
function isTestEnvironment(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

/**
 * Captures queued emails instead of sending them in tests. Pass an array to
 * inspect what would have been sent, or null to discard.
 */
let queueSink: EmailPayload[] | null = null;

export function setTestEmailSink(sink: EmailPayload[] | null): void {
  queueSink = sink;
}

export async function enqueueEmail(payload: EmailPayload): Promise<void> {
  if (isTestEnvironment()) {
    queueSink?.push(payload);
    return;
  }
  const boss = await getBoss();
  await boss.send(EMAIL_QUEUE, payload);
}

/** Re-reads the reminder time and updates the daily schedule. */
export async function resyncReminderSchedules(): Promise<void> {
  await scheduleReminders(await getBoss());
}
