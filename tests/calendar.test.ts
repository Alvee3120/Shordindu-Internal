import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  dueCalendarEvents,
  listCalendar,
  setCalendarEventDone,
  updateCalendarEvent,
} from "@/lib/calendar";
import { createAssignment } from "@/lib/assignments";
import { runCalendarReminder } from "@/jobs/reminders";
import { calendarEventSchema } from "@/lib/validators";
import type { EmailPayload } from "@/lib/email";

const start = new Date("2026-11-17T12:00:00Z"); // Tuesday
const createdUserIds: string[] = [];
const createdEventIds: string[] = [];
const createdAssignmentIds: string[] = [];

async function createUser(
  name: string,
  role: Role = Role.Employee,
): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `calendar-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      department: "IT",
      position: "Tester",
      role,
      status: UserStatus.Active,
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
    avatarFile: user.avatarFile,
  };
}

async function trackEvent(user: SessionUser, date = "2026-11-17") {
  const result = await createCalendarEvent(user, {
    title: "Team meeting",
    notes: "Bring the report",
    date,
  });
  if (!result.ok) throw new Error("event creation failed");
  createdEventIds.push(result.data.id);
  return result.data;
}

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { targetId: { in: [...createdEventIds, ...createdAssignmentIds] } },
        { actorId: { in: createdUserIds } },
      ],
    },
  });
  await prisma.assignmentAssignee.deleteMany({
    where: { assignmentId: { in: createdAssignmentIds } },
  });
  await prisma.assignment.deleteMany({
    where: { id: { in: createdAssignmentIds } },
  });
  await prisma.calendarEvent.deleteMany({
    where: { id: { in: createdEventIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("calendar entries", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a personal entry and shows it on the chosen day", async () => {
    const user = await createUser("Owner");
    const event = await trackEvent(user);

    expect(event.title).toBe("Team meeting");
    expect(event.notes).toBe("Bring the report");

    const items = await listCalendar(user, "2026-11-01", "2026-11-30");
    const mine = items.find((item) => item.id === `event:${event.id}`);

    expect(mine).toBeDefined();
    expect(mine?.date).toBe("2026-11-17");
    expect(mine?.kind).toBe("event");
    expect(mine?.canEdit).toBe(true);
  });

  it("only lists entries inside the requested range", async () => {
    const user = await createUser("Range Owner");
    await trackEvent(user, "2026-11-17");
    await trackEvent(user, "2026-12-02");

    const november = await listCalendar(user, "2026-11-01", "2026-11-30");
    const december = await listCalendar(user, "2026-12-01", "2026-12-31");

    expect(november.every((item) => item.date.startsWith("2026-11"))).toBe(true);
    expect(december.every((item) => item.date.startsWith("2026-12"))).toBe(true);
  });

  it("keeps each user's calendar private", async () => {
    const owner = await createUser("Private Owner");
    const other = await createUser("Nosy Person");
    await trackEvent(owner);

    const otherItems = await listCalendar(other, "2026-11-01", "2026-11-30");
    expect(otherItems.every((item) => item.kind === "assignment")).toBe(true);
    expect(otherItems.some((item) => item.title === "Team meeting")).toBe(false);
  });

  it("blocks editing or deleting someone else's entry", async () => {
    const owner = await createUser("Owner");
    const other = await createUser("Other");
    const event = await trackEvent(owner);

    expect(
      await updateCalendarEvent(other, event.id, { title: "Hijacked" }),
    ).toEqual({ ok: false, reason: "forbidden" });

    expect(await deleteCalendarEvent(other, event.id)).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("edits, resets the reminder when the day changes, and soft deletes", async () => {
    const user = await createUser("Editor");
    const event = await trackEvent(user);

    // Pretend a reminder already went out for the original day.
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { remindedAt: new Date() },
    });

    const moved = await updateCalendarEvent(user, event.id, {
      title: "Moved meeting",
      date: "2026-11-20",
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.data.title).toBe("Moved meeting");
    expect(moved.data.date).toBe("2026-11-20");

    const row = await prisma.calendarEvent.findUnique({
      where: { id: event.id },
    });
    // A new day means it should be eligible for a fresh reminder.
    expect(row?.remindedAt).toBeNull();

    expect((await deleteCalendarEvent(user, event.id)).ok).toBe(true);
    const items = await listCalendar(user, "2026-11-01", "2026-11-30");
    expect(items.some((item) => item.id === `event:${event.id}`)).toBe(false);
  });

  it("rejects input that carries no changes", async () => {
    const user = await createUser("No Change");
    const event = await trackEvent(user);

    expect(await updateCalendarEvent(user, event.id, {})).toEqual({
      ok: false,
      reason: "no_changes",
    });
  });
});

describe("assignments on the calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an assignment on the assignee's calendar on its due date", async () => {
    const manager = await createUser("Manager", Role.Manager);
    const assignee = await createUser("Assignee");

    const assignment = await createAssignment(manager, {
      contentHtml: "<p>Prepare the quarterly report</p>",
      assigneeIds: [assignee.id],
      dueDate: "2026-11-19",
    });
    expect(assignment.ok).toBe(true);
    if (!assignment.ok) return;
    createdAssignmentIds.push(assignment.data.id);

    const items = await listCalendar(assignee, "2026-11-01", "2026-11-30");
    const entry = items.find(
      (item) => item.id === `assignment:${assignment.data.id}`
    );

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("assignment");
    expect(entry?.date).toBe("2026-11-19");
    expect(entry?.title).toContain("quarterly report");
    // Assignment entries are read-only; they are edited on the assignment page.
    expect(entry?.canEdit).toBe(false);
  });

  it("does not show a completed assignment", async () => {
    const manager = await createUser("Manager", Role.Manager);
    const assignee = await createUser("Assignee");

    const assignment = await createAssignment(manager, {
      contentHtml: "<p>Done already</p>",
      assigneeIds: [assignee.id],
      dueDate: "2026-11-19",
    });
    expect(assignment.ok).toBe(true);
    if (!assignment.ok) return;
    createdAssignmentIds.push(assignment.data.id);

    await prisma.assignmentAssignee.update({
      where: {
        assignmentId_userId: {
          assignmentId: assignment.data.id,
          userId: assignee.id,
        },
      },
      data: { status: "done", doneAt: new Date() },
    });

    const items = await listCalendar(assignee, "2026-11-01", "2026-11-30");
    expect(
      items.some((item) => item.id === `assignment:${assignment.data.id}`)
    ).toBe(false);
  });
});

describe("calendar input validation", () => {
  it("accepts an empty notes box, which arrives as null", () => {
    const result = calendarEventSchema.safeParse({
      title: "No notes needed",
      notes: null,
      date: "2026-11-20",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a missing notes key and a real note", () => {
    expect(
      calendarEventSchema.safeParse({ title: "A title", date: "2026-11-20" })
        .success,
    ).toBe(true);

    expect(
      calendarEventSchema.safeParse({
        title: "A title",
        notes: "Something to remember",
        date: "2026-11-20",
      }).success,
    ).toBe(true);
  });
});

describe("marking an entry done", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the record but flags it done", async () => {
    const user = await createUser("Done Owner");
    const event = await trackEvent(user);

    const result = await setCalendarEventDone(user, event.id, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.done).toBe(true);

    // The record stays on the calendar so the day can still show it.
    const items = await listCalendar(user, "2026-11-01", "2026-11-30");
    const entry = items.find((item) => item.id === `event:${event.id}`);
    expect(entry).toBeDefined();
    expect(entry?.done).toBe(true);

    const row = await prisma.calendarEvent.findUnique({
      where: { id: event.id },
    });
    expect(row?.deletedAt).toBeNull();
    expect(row?.doneAt).not.toBeNull();
  });

  it("can be reopened", async () => {
    const user = await createUser("Undo Owner");
    const event = await trackEvent(user);

    await setCalendarEventDone(user, event.id, true);
    const reopened = await setCalendarEventDone(user, event.id, false);

    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.data.done).toBe(false);

    const items = await listCalendar(user, "2026-11-01", "2026-11-30");
    expect(
      items.find((item) => item.id === `event:${event.id}`)?.done,
    ).toBe(false);
  });

  it("stops a done entry from being reminded", async () => {
    const user = await createUser("No Reminder");
    const event = await trackEvent(user, "2026-11-17");

    await setCalendarEventDone(user, event.id, true);

    const due = await dueCalendarEvents("2026-11-17");
    expect(due.some((entry) => entry.user.id === user.id)).toBe(false);
  });

  it("refuses to touch someone else's entry", async () => {
    const owner = await createUser("Owner");
    const other = await createUser("Other");
    const event = await trackEvent(owner);

    expect(await setCalendarEventDone(other, event.id, true)).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });
});

describe("calendar reminder", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    await prisma.jobRun.deleteMany({ where: { job: "calendar-reminder" } });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await prisma.jobRun.deleteMany({ where: { job: "calendar-reminder" } });
  });

  it("emails the owner of an entry due today, once", async () => {
    const user = await createUser("Reminder Owner");
    await trackEvent(user, "2026-11-17");

    const sent: EmailPayload[] = [];
    await runCalendarReminder(async (payload) => {
      sent.push(payload);
    });

    // Other entries in this file may also fall today, so check this owner's.
    const mine = sent.filter((payload) => payload.to === user.email);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.subject).toContain("Team meeting");

    // Everything today is marked, so a second run sends nothing new.
    const before = sent.length;
    const second = await runCalendarReminder(async (payload) => {
      sent.push(payload);
    });
    expect(second.status).toBe("already_ran");
    expect(sent).toHaveLength(before);
  });

  it("does not email entries due on another day", async () => {
    const user = await createUser("Future Owner");
    await trackEvent(user, "2026-11-25");

    const due = await dueCalendarEvents("2026-11-17");
    expect(due.some((event) => event.user.id === user.id)).toBe(false);
  });
});
