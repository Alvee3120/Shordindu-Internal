import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  cancelAssignment,
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssigneeStatus,
  updateAssignment,
} from "@/lib/assignments";

const start = new Date("2026-11-17T12:00:00Z");
const createdUserIds: string[] = [];
const createdAssignmentIds: string[] = [];

async function createUser(
  name: string,
  role: Role = Role.Employee,
  department = "IT",
): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `assignments-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      department,
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
  };
}

async function makeAssignment(
  creator: SessionUser,
  assignees: SessionUser[],
  options: { dueDate?: string | null; priority?: "normal" | "urgent" } = {},
) {
  const result = await createAssignment(creator, {
    contentHtml: "<p>Do the work</p>",
    assigneeIds: assignees.map((assignee) => assignee.id),
    dueDate: options.dueDate,
    priority: options.priority,
  });
  if (!result.ok) throw new Error(`create failed: ${result.reason}`);
  createdAssignmentIds.push(result.data.id);
  return result.data;
}

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: createdAssignmentIds } },
  });
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
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("assignment creation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an open assignment with assignees and notifies them", async () => {
    const creator = await createUser("Creator");
    const first = await createUser("First Assignee");
    const second = await createUser("Second Assignee");

    const assignment = await makeAssignment(creator, [first, second]);

    expect(assignment.status).toBe("open");
    expect(assignment.progress).toEqual({ done: 0, total: 2 });
    expect(assignment.overdue).toBe(false);

    expect(
      await prisma.notification.count({ where: { userId: first.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId: second.id } }),
    ).toBe(1);
  });

  it("expands a department into its active members", async () => {
    const creator = await createUser("Creator", Role.Manager, "HR");
    const member = await createUser("IT Member", Role.Employee, "Supply Chain");
    await createUser("Other Member", Role.Employee, "Finance");

    const result = await createAssignment(creator, {
      contentHtml: "<p>Department task</p>",
      department: "Supply Chain",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdAssignmentIds.push(result.data.id);

    expect(result.data.assignees.map((entry) => entry.userId)).toContain(
      member.id,
    );
    expect(result.data.progress.total).toBe(1);
  });

  it("rejects an assignment with no assignees", async () => {
    const creator = await createUser("Creator");

    expect(
      await createAssignment(creator, {
        contentHtml: "<p>Nobody</p>",
      }),
    ).toEqual({ ok: false, reason: "invalid_assignees" });
  });

  it("rejects empty content", async () => {
    const creator = await createUser("Creator");
    const assignee = await createUser("Assignee");

    expect(
      await createAssignment(creator, {
        contentHtml: "<p></p>",
        assigneeIds: [assignee.id],
      }),
    ).toEqual({ ok: false, reason: "empty_content" });
  });
});

describe("assignment editing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets the creator edit text after the Dhaka day changes", async () => {
    const creator = await createUser("Creator");
    const assignee = await createUser("Assignee");
    const assignment = await makeAssignment(creator, [assignee]);

    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));

    const result = await updateAssignment(creator, assignment.id, {
      contentHtml: "<p>Updated instruction</p>",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.editedAt).not.toBeNull();
      expect(result.data.contentHtml).toContain("Updated instruction");
    }

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: assignment.id, action: "assignment.edited" },
    });
    expect(audit).not.toBeNull();
  });

  it("blocks other Employees but allows Managers to edit", async () => {
    const creator = await createUser("Creator");
    const other = await createUser("Other Employee");
    const manager = await createUser("Manager", Role.Manager);
    const assignee = await createUser("Assignee");
    const assignment = await makeAssignment(creator, [assignee]);

    expect(
      await updateAssignment(other, assignment.id, {
        contentHtml: "<p>Hijack</p>",
      }),
    ).toEqual({ ok: false, reason: "forbidden" });

    const result = await updateAssignment(manager, assignment.id, {
      contentHtml: "<p>Manager edit</p>",
    });
    expect(result.ok).toBe(true);
  });

  it("adds and removes assignees with notifications and audit", async () => {
    const creator = await createUser("Creator");
    const first = await createUser("First");
    const second = await createUser("Second");
    const assignment = await makeAssignment(creator, [first]);

    const added = await updateAssignment(creator, assignment.id, {
      addAssigneeIds: [second.id],
    });
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.data.progress.total).toBe(2);
    }
    expect(
      await prisma.notification.count({ where: { userId: second.id } }),
    ).toBe(1);

    const removed = await updateAssignment(creator, assignment.id, {
      removeAssigneeIds: [first.id],
    });
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(removed.data.progress.total).toBe(1);
      expect(removed.data.assignees.map((a) => a.userId)).not.toContain(
        first.id,
      );
    }

    const audit = await prisma.auditLog.findMany({
      where: { targetId: assignment.id },
      select: { action: true },
    });
    const actions = audit.map((entry) => entry.action);
    expect(actions).toContain("assignment.assignee_added");
    expect(actions).toContain("assignment.assignee_removed");
  });
});

describe("assignee status", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks per-person status, notes and overall completion", async () => {
    const creator = await createUser("Creator");
    const first = await createUser("First");
    const second = await createUser("Second");
    const assignment = await makeAssignment(creator, [first, second]);

    const firstDone = await updateAssigneeStatus(first, assignment.id, {
      status: "done",
      note: "Finished early",
    });
    expect(firstDone.ok).toBe(true);
    if (firstDone.ok) {
      expect(firstDone.data.status).toBe("open");
      expect(firstDone.data.progress.done).toBe(1);
    }

    const secondDone = await updateAssigneeStatus(second, assignment.id, {
      status: "done",
    });
    expect(secondDone.ok).toBe(true);
    if (secondDone.ok) {
      expect(secondDone.data.status).toBe("completed");
      expect(secondDone.data.progress).toEqual({ done: 2, total: 2 });
    }

    const notification = await prisma.notification.findFirst({
      where: { userId: creator.id, type: "assignment_status" },
    });
    expect(notification).not.toBeNull();

    const note = await prisma.assignmentAssignee.findUnique({
      where: {
        assignmentId_userId: {
          assignmentId: assignment.id,
          userId: first.id,
        },
      },
    });
    expect(note?.doneNote).toBe("Finished early");
  });

  it("refuses status changes from non-assignees", async () => {
    const creator = await createUser("Creator");
    const assignee = await createUser("Assignee");
    const outsider = await createUser("Outsider");
    const assignment = await makeAssignment(creator, [assignee]);

    expect(
      await updateAssigneeStatus(outsider, assignment.id, {
        status: "done",
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("reopens a completed assignment when someone moves back to in progress", async () => {
    const creator = await createUser("Creator");
    const assignee = await createUser("Assignee");
    const assignment = await makeAssignment(creator, [assignee]);

    await updateAssigneeStatus(assignee, assignment.id, { status: "done" });
    const reopened = await updateAssigneeStatus(assignee, assignment.id, {
      status: "in_progress",
    });

    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.data.status).toBe("open");
      expect(reopened.data.progress.done).toBe(0);
    }
  });
});

describe("cancel and delete", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels an assignment and blocks further edits", async () => {
    const creator = await createUser("Creator");
    const assignee = await createUser("Assignee");
    const assignment = await makeAssignment(creator, [assignee]);

    const cancelled = await cancelAssignment(creator, assignment.id);
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) expect(cancelled.data.status).toBe("cancelled");

    expect(
      await updateAssignment(creator, assignment.id, {
        contentHtml: "<p>After cancel</p>",
      }),
    ).toEqual({ ok: false, reason: "invalid_state" });
  });

  it("deletes only while nobody has started", async () => {
    const creator = await createUser("Creator");
    const assignee = await createUser("Assignee");
    const assignment = await makeAssignment(creator, [assignee]);

    await updateAssigneeStatus(assignee, assignment.id, {
      status: "in_progress",
    });

    expect(await deleteAssignment(creator, assignment.id)).toEqual({
      ok: false,
      reason: "started",
    });

    await updateAssigneeStatus(assignee, assignment.id, { status: "pending" });
    expect((await deleteAssignment(creator, assignment.id)).ok).toBe(true);

    const stored = await prisma.assignment.findUnique({
      where: { id: assignment.id },
    });
    expect(stored?.deletedAt).not.toBeNull();
  });
});

describe("overdue and filters", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags past-due open assignments as overdue", async () => {
    const creator = await createUser("Creator");
    const assignee = await createUser("Assignee");
    const overdue = await makeAssignment(creator, [assignee], {
      dueDate: "2026-11-16",
    });
    expect(overdue.overdue).toBe(true);

    await updateAssigneeStatus(assignee, overdue.id, { status: "done" });
    const reopened = await makeAssignment(creator, [assignee], {
      dueDate: "2026-11-18",
    });
    expect(reopened.overdue).toBe(false);
  });

  it("filters by view, person, department, status and due range", async () => {
    const manager = await createUser("Filter Manager", Role.Manager, "IT");
    const assignee = await createUser("Filter Assignee", Role.Employee, "Finance");
    const assignment = await makeAssignment(manager, [assignee], {
      dueDate: "2026-11-20",
    });

    const toMe = await listAssignments(assignee, { view: "to_me" });
    expect(toMe.some((entry) => entry.id === assignment.id)).toBe(true);

    const byMe = await listAssignments(manager, { view: "by_me" });
    expect(byMe.some((entry) => entry.id === assignment.id)).toBe(true);

    const byPerson = await listAssignments(manager, {
      view: "all",
      personId: assignee.id,
    });
    expect(byPerson.some((entry) => entry.id === assignment.id)).toBe(true);

    const byDepartment = await listAssignments(manager, {
      view: "all",
      department: "Finance",
    });
    expect(byDepartment.some((entry) => entry.id === assignment.id)).toBe(true);

    const byStatus = await listAssignments(manager, {
      view: "all",
      status: "open",
    });
    expect(byStatus.some((entry) => entry.id === assignment.id)).toBe(true);

    const byDue = await listAssignments(manager, {
      view: "all",
      dueFrom: "2026-11-19",
      dueTo: "2026-11-21",
    });
    expect(byDue.some((entry) => entry.id === assignment.id)).toBe(true);
  });
});
