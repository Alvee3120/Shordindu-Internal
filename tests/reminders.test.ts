import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AssignmentStatus,
  AssigneeStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { markLeave } from "@/lib/leaves";
import {
  ASSIGNMENT_DUE_JOB,
  DAILY_REMINDER_JOB,
  runAssignmentDueReminder,
  runDailyUpdateReminder,
} from "@/jobs/reminders";
import { cronForReminderTime } from "@/lib/queue";
import type { EmailPayload } from "@/lib/email";

const start = new Date("2026-11-17T12:00:00Z"); // Tuesday, 18:00 Dhaka
const createdUserIds: string[] = [];
const createdUpdateIds: string[] = [];
const createdAssignmentIds: string[] = [];
const createdHolidayIds: string[] = [];
const createdLeaveIds: string[] = [];

async function createUser(
  name: string,
  status: UserStatus = UserStatus.Active,
): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `reminders-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      department: "IT",
      position: "Tester",
      role: Role.Employee,
      status,
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department,
    position: user.position,
  };
}

async function addUpdate(userId: string): Promise<void> {
  const update = await prisma.update.create({
    data: {
      userId,
      contentHtml: "<p>Posted</p>",
      contentText: "Posted",
      updateDate: new Date("2026-11-17T00:00:00.000Z"),
      postedAt: new Date(),
      isLate: false,
    },
  });
  createdUpdateIds.push(update.id);
}

async function addLeave(user: SessionUser): Promise<void> {
  const result = await markLeave(user, {
    fromDate: "2026-11-17",
    toDate: "2026-11-17",
  });
  if (result.ok) createdLeaveIds.push(result.leave.id);
}

async function addAssignment({
  creatorId,
  dueDate,
  assignees,
}: {
  creatorId: string;
  dueDate: string;
  assignees: { userId: string; status?: AssigneeStatus }[];
}): Promise<string> {
  const assignment = await prisma.assignment.create({
    data: {
      createdById: creatorId,
      contentHtml: "<p>Due assignment</p>",
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
      status: AssignmentStatus.open,
      assignees: {
        createMany: {
          data: assignees.map((assignee) => ({
            userId: assignee.userId,
            status: assignee.status ?? AssigneeStatus.pending,
          })),
        },
      },
    },
  });
  createdAssignmentIds.push(assignment.id);
  return assignment.id;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
  await prisma.jobRun.deleteMany({
    where: {
      job: { in: [DAILY_REMINDER_JOB, ASSIGNMENT_DUE_JOB] },
      runDate: {
        in: [
          new Date("2026-11-17T00:00:00.000Z"),
          new Date("2026-11-20T00:00:00.000Z"),
        ],
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.jobRun.deleteMany({
    where: { job: { in: [DAILY_REMINDER_JOB, ASSIGNMENT_DUE_JOB] } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      targetId: {
        in: [
          ...createdLeaveIds,
          ...createdHolidayIds,
          ...createdAssignmentIds,
        ],
      },
    },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.leave.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
  await prisma.assignmentAssignee.deleteMany({
    where: {
      OR: [
        { userId: { in: createdUserIds } },
        { assignmentId: { in: createdAssignmentIds } },
      ],
    },
  });
  await prisma.assignment.deleteMany({
    where: { id: { in: createdAssignmentIds } },
  });
  await prisma.update.deleteMany({ where: { id: { in: createdUpdateIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("daily update reminder", () => {
  it("emails only active, non-leave users who have not posted", async () => {
    const missing = await createUser("Missing Person");
    const submitted = await createUser("Submitted Person");
    const onLeave = await createUser("Leave Person");
    const disabled = await createUser("Disabled Person", UserStatus.Disabled);

    await addUpdate(submitted.id);
    await addLeave(onLeave);

    const sent: EmailPayload[] = [];
    const result = await runDailyUpdateReminder(async (payload) => {
      sent.push(payload);
    });

    expect(result.status).toBe("completed");
    const recipientIds = result.recipients.map((recipient) => recipient.id);
    expect(recipientIds).toContain(missing.id);
    expect(recipientIds).not.toContain(submitted.id);
    expect(recipientIds).not.toContain(onLeave.id);
    expect(recipientIds).not.toContain(disabled.id);
    expect(sent.some((payload) => payload.to === missing.email)).toBe(true);
    expect(sent.some((payload) => payload.to === submitted.email)).toBe(false);
    expect(result.emailCount).toBe(sent.length);

    const run = await prisma.jobRun.findUnique({
      where: {
        job_runDate: {
          job: DAILY_REMINDER_JOB,
          runDate: new Date("2026-11-17T00:00:00.000Z"),
        },
      },
    });
    expect(run?.status).toBe("completed");
    expect(run?.recipientCount).toBe(result.emailCount);
  });

  it("does not send twice for the same Dhaka date", async () => {
    await createUser("Second Run Missing");

    const firstSent: EmailPayload[] = [];
    await runDailyUpdateReminder(async (payload) => {
      firstSent.push(payload);
    });

    const secondSent: EmailPayload[] = [];
    const second = await runDailyUpdateReminder(async (payload) => {
      secondSent.push(payload);
    });

    expect(second.status).toBe("already_ran");
    expect(second.emailCount).toBe(0);
    expect(secondSent).toHaveLength(0);
  });

  it("skips weekends without emailing", async () => {
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z")); // Friday
    const sent: EmailPayload[] = [];

    const result = await runDailyUpdateReminder(async (payload) => {
      sent.push(payload);
    });

    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("weekend");
    expect(sent).toHaveLength(0);

    const run = await prisma.jobRun.findUnique({
      where: {
        job_runDate: {
          job: DAILY_REMINDER_JOB,
          runDate: new Date("2026-11-20T00:00:00.000Z"),
        },
      },
    });
    expect(run?.status).toBe("skipped");
    expect(run?.detail).toBe("weekend");

    const again = await runDailyUpdateReminder(async () => {});
    expect(again.status).toBe("already_ran");
  });

  it("skips holidays without emailing", async () => {
    const holiday = await prisma.holiday.create({
      data: {
        date: new Date("2026-11-17T00:00:00.000Z"),
        name: "Founders Day",
      },
    });
    createdHolidayIds.push(holiday.id);

    const sent: EmailPayload[] = [];
    const result = await runDailyUpdateReminder(async (payload) => {
      sent.push(payload);
    });

    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("holiday: Founders Day");
    expect(sent).toHaveLength(0);
  });
});

describe("assignment due reminder", () => {
  it("emails only undone assignees of assignments due today", async () => {
    const creator = await createUser("Creator");
    const pending = await createUser("Pending Assignee");
    const done = await createUser("Done Assignee");
    const tomorrow = await createUser("Tomorrow Assignee");

    const dueTodayId = await addAssignment({
      creatorId: creator.id,
      dueDate: "2026-11-17",
      assignees: [
        { userId: pending.id },
        { userId: done.id, status: AssigneeStatus.done },
      ],
    });
    await addAssignment({
      creatorId: creator.id,
      dueDate: "2026-11-18",
      assignees: [{ userId: tomorrow.id }],
    });

    const sent: EmailPayload[] = [];
    const result = await runAssignmentDueReminder(async (payload) => {
      sent.push(payload);
    });

    expect(result.status).toBe("completed");
    expect(sent.some((payload) => payload.to === pending.email)).toBe(true);
    expect(sent.some((payload) => payload.to === done.email)).toBe(false);
    expect(sent.some((payload) => payload.to === tomorrow.email)).toBe(false);
    expect(sent[0]?.html).toContain(`assignment-${dueTodayId}`);

    const second = await runAssignmentDueReminder(async () => {});
    expect(second.status).toBe("already_ran");
    expect(second.emailCount).toBe(0);
  });

  it("schedules the daily reminder in Dhaka time", () => {
    expect(cronForReminderTime("19:00")).toBe("0 19 * * *");
    expect(cronForReminderTime("07:05")).toBe("5 7 * * *");
  });
});
