import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { applyForLeave, decideLeave, listLeaves } from "@/lib/leaves";
import {
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
} from "@/lib/holidays";
import { getNotSubmittedToday, getOnLeaveUserIds } from "@/lib/attendance";
import { getWeekendDays, setWeekendDays } from "@/lib/settings";
import { searchUsers } from "@/lib/user-management";

const start = new Date("2026-11-17T12:00:00Z"); // Tuesday, 18:00 Dhaka
const createdUserIds: string[] = [];
const createdHolidayIds: string[] = [];
const createdLeaveIds: string[] = [];
const createdUpdateIds: string[] = [];

async function createUser(
  name: string,
  role: Role = Role.Employee,
  status: UserStatus = UserStatus.Active,
  department = "IT",
): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `leave-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      department,
      position: "Tester",
      role,
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
    avatarFile: user.avatarFile,
  };
}

async function addUpdate(userId: string, deleted = false): Promise<void> {
  const update = await prisma.update.create({
    data: {
      userId,
      contentHtml: "<p>Today</p>",
      contentText: "Today",
      updateDate: new Date("2026-11-17T00:00:00.000Z"),
      postedAt: new Date(),
      isLate: false,
      deletedAt: deleted ? new Date() : null,
    },
  });
  createdUpdateIds.push(update.id);
}

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { targetId: { in: [...createdLeaveIds, ...createdHolidayIds] } },
        { targetId: { in: createdUpdateIds } },
      ],
    },
  });
  await prisma.leave.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
  await prisma.update.deleteMany({ where: { id: { in: createdUpdateIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("leave requests", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a user apply with a reason, starting as pending", async () => {
    const user = await createUser("Self Leave");

    const result = await applyForLeave(user, {
      fromDate: "2026-11-17",
      toDate: "2026-11-18",
      reason: "Down with fever",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdLeaveIds.push(result.leave.id);

    expect(result.leave.userId).toBe(user.id);
    expect(result.leave.reason).toBe("Down with fever");
    expect(result.leave.status).toBe("Pending");
    expect(result.leave.decidedBy).toBeNull();

    // A pending request must not mark the person as away yet.
    const todayLeave = await getOnLeaveUserIds("2026-11-17");
    expect(todayLeave.has(user.id)).toBe(false);
  });

  it("blocks Employees from applying for someone else", async () => {
    const employee = await createUser("Employee");
    const other = await createUser("Other");

    expect(
      await applyForLeave(employee, {
        userId: other.id,
        fromDate: "2026-11-17",
        toDate: "2026-11-17",
        reason: "Not mine",
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("lets Manager, HR and Admin mark leave for others as approved straight away", async () => {
    const manager = await createUser("Manager", Role.Manager);
    const target = await createUser("Target");

    const result = await applyForLeave(manager, {
      userId: target.id,
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
      reason: "Personal matters",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdLeaveIds.push(result.leave.id);

    // The approver marking it is the decision itself.
    expect(result.leave.status).toBe("Approved");
    expect(result.leave.decidedBy?.id).toBe(manager.id);
    expect(result.leave.userId).toBe(target.id);

    const onLeave = await getOnLeaveUserIds("2026-11-17");
    expect(onLeave.has(target.id)).toBe(true);
  });

  it("rejects an inverted range and inactive users", async () => {
    const manager = await createUser("Manager", Role.Manager);
    const disabled = await createUser(
      "Disabled",
      Role.Employee,
      UserStatus.Disabled,
    );

    expect(
      await applyForLeave(manager, {
        fromDate: "2026-11-18",
        toDate: "2026-11-17",
        reason: "Backwards",
      }),
    ).toEqual({ ok: false, reason: "invalid_range" });

    expect(
      await applyForLeave(manager, {
        userId: disabled.id,
        fromDate: "2026-11-17",
        toDate: "2026-11-17",
        reason: "Disabled user",
      }),
    ).toEqual({ ok: false, reason: "invalid_user" });
  });

  it("shows all leaves to approvers and only own leaves to employees", async () => {
    const employee = await createUser("Employee");
    const manager = await createUser("Manager", Role.Manager);
    const target = await createUser("Target");

    const first = await applyForLeave(employee, {
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
      reason: "Own leave",
    });
    const second = await applyForLeave(manager, {
      userId: target.id,
      fromDate: "2026-11-17",
      toDate: "2026-11-18",
      reason: "Marked for someone",
    });
    if (first.ok) createdLeaveIds.push(first.leave.id);
    if (second.ok) createdLeaveIds.push(second.leave.id);

    const employeeView = await listLeaves(employee);
    expect(employeeView.every((leave) => leave.userId === employee.id)).toBe(
      true,
    );

    const managerView = await listLeaves(manager);
    const ids = managerView.map((leave) => leave.userId);
    expect(ids).toContain(employee.id);
    expect(ids).toContain(target.id);
  });
});

describe("leave approval", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function pendingRequest(user: SessionUser): Promise<string> {
    const result = await applyForLeave(user, {
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
      reason: "Family event",
    });
    if (!result.ok) throw new Error("request failed");
    createdLeaveIds.push(result.leave.id);
    return result.leave.id;
  }

  it("records who approved and marks the person on leave that day", async () => {
    const employee = await createUser("Employee");
    const manager = await createUser("Rifat", Role.Manager);
    const leaveId = await pendingRequest(employee);

    const result = await decideLeave(manager, leaveId, "approve");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leave.status).toBe("Approved");
    expect(result.leave.decidedBy?.name).toBe("Rifat");
    expect(result.leave.decidedAt).not.toBeNull();

    // Approved leave now counts as away.
    const onLeave = await getOnLeaveUserIds("2026-11-17");
    expect(onLeave.has(employee.id)).toBe(true);
  });

  it("records a rejection and keeps the person off the leave list", async () => {
    const employee = await createUser("Employee");
    const hr = await createUser("HR Person", Role.HR);
    const leaveId = await pendingRequest(employee);

    const result = await decideLeave(hr, leaveId, "reject");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leave.status).toBe("Rejected");
    expect(result.leave.decidedBy?.name).toBe("HR Person");

    const onLeave = await getOnLeaveUserIds("2026-11-17");
    expect(onLeave.has(employee.id)).toBe(false);
  });

  it("stops an approver from deciding their own request", async () => {
    const admin = await createUser("Admin Person", Role.Admin);
    const leaveId = await pendingRequest(admin);

    expect(await decideLeave(admin, leaveId, "approve")).toEqual({
      ok: false,
      reason: "self_decision",
    });
  });

  it("blocks Employees and refuses a second decision", async () => {
    const employee = await createUser("Employee");
    const manager = await createUser("Manager", Role.Manager);
    const leaveId = await pendingRequest(employee);

    expect(await decideLeave(employee, leaveId, "approve")).toEqual({
      ok: false,
      reason: "forbidden",
    });

    expect((await decideLeave(manager, leaveId, "approve")).ok).toBe(true);
    expect(await decideLeave(manager, leaveId, "reject")).toEqual({
      ok: false,
      reason: "already_decided",
    });
  });

  it("hides the decision buttons from the applicant and on decided rows", async () => {
    const employee = await createUser("Employee");
    const manager = await createUser("Manager", Role.Manager);
    const leaveId = await pendingRequest(employee);

    const forManager = await listLeaves(manager);
    expect(forManager.find((leave) => leave.id === leaveId)?.canDecide).toBe(
      true,
    );

    const forEmployee = await listLeaves(employee);
    expect(forEmployee.find((leave) => leave.id === leaveId)?.canDecide).toBe(
      false,
    );

    await decideLeave(manager, leaveId, "approve");
    const after = await listLeaves(manager);
    expect(after.find((leave) => leave.id === leaveId)?.canDecide).toBe(false);
  });

  it("notifies the applicant when the decision is made", async () => {
    const employee = await createUser("Employee");
    const manager = await createUser("Manager", Role.Manager);
    const leaveId = await pendingRequest(employee);

    await decideLeave(manager, leaveId, "approve");

    const notification = await prisma.notification.findFirst({
      where: { userId: employee.id, type: "leave_decision" },
    });
    expect(notification?.message).toContain("approved your leave");
  });
});

describe("holidays", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets HR create, edit and delete a holiday", async () => {
    const hr = await createUser("HR", Role.HR);

    const created = await createHoliday(hr, {
      date: "2026-11-19",
      name: "Company Day",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdHolidayIds.push(created.holiday.id);

    const updated = await updateHoliday(hr, created.holiday.id, {
      name: "Company Holiday",
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.holiday.name).toBe("Company Holiday");

    const holidays = await listHolidays();
    expect(holidays.some((holiday) => holiday.id === created.holiday.id)).toBe(
      true,
    );

    expect((await deleteHoliday(hr, created.holiday.id)).ok).toBe(true);
  });

  it("blocks Employees and rejects duplicate dates", async () => {
    const employee = await createUser("Employee");
    const hr = await createUser("HR", Role.HR);

    expect(
      await createHoliday(employee, {
        date: "2026-11-19",
        name: "Nope",
      }),
    ).toEqual({ ok: false, reason: "forbidden" });

    const first = await createHoliday(hr, {
      date: "2026-11-19",
      name: "First",
    });
    if (first.ok) createdHolidayIds.push(first.holiday.id);

    expect(
      await createHoliday(hr, {
        date: "2026-11-19",
        name: "Duplicate",
      }),
    ).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("weekend setting", () => {
  it("reads the seeded weekend and stores custom days", async () => {
    const before = await getWeekendDays();
    expect(before.length).toBeGreaterThan(0);

    await setWeekendDays([5, 6]);
    expect(await getWeekendDays()).toEqual([5, 6]);

    await setWeekendDays(before);
  });
});

describe("not submitted today", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("excludes people who posted, people on leave, and inactive users", async () => {
    const posted = await createUser("Posted");
    const deleted = await createUser("Deleted Post");
    const onLeave = await createUser("On Leave");
    const missing = await createUser("Missing");
    const disabled = await createUser(
      "Disabled",
      Role.Employee,
      UserStatus.Disabled,
    );

    await addUpdate(posted.id);
    await addUpdate(deleted.id, true);
    const leave = await applyForLeave(onLeave, {
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
      reason: "Approved time off",
    });
    if (leave.ok) {
      createdLeaveIds.push(leave.leave.id);
      await prisma.leave.update({
        where: { id: leave.leave.id },
        data: { status: "Approved" },
      });
    }

    const summary = await getNotSubmittedToday();
    const ids = summary.missing.map((user) => user.id);

    expect(summary.isWorkingDay).toBe(true);
    expect(ids).not.toContain(posted.id);
    expect(ids).toContain(deleted.id);
    expect(ids).not.toContain(onLeave.id);
    expect(ids).toContain(missing.id);
    expect(ids).not.toContain(disabled.id);
  });

  it("returns an empty list on a weekend", async () => {
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z")); // Friday
    const summary = await getNotSubmittedToday();

    expect(summary.isWorkingDay).toBe(false);
    expect(summary.reason).toBe("weekend");
    expect(summary.missing).toEqual([]);
  });

  it("returns an empty list on a holiday and names it", async () => {
    const hr = await createUser("HR", Role.HR);
    const holiday = await createHoliday(hr, {
      date: "2026-11-17",
      name: "Founders Day",
    });
    if (!holiday.ok) throw new Error("holiday setup failed");
    createdHolidayIds.push(holiday.holiday.id);

    const summary = await getNotSubmittedToday();
    expect(summary.isWorkingDay).toBe(false);
    expect(summary.reason).toBe("holiday");
    expect(summary.holidayName).toBe("Founders Day");
    expect(summary.missing).toEqual([]);
  });

  it("marks users on leave today in the users list", async () => {
    const user = await createUser("List On Leave");
    const leave = await applyForLeave(user, {
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
      reason: "Medical appointment",
    });
    if (leave.ok) {
      createdLeaveIds.push(leave.leave.id);
      // Only approved leave shows up as "on leave".
      await prisma.leave.update({
        where: { id: leave.leave.id },
        data: { status: "Approved" },
      });
    }

    const users = await searchUsers(user.email);
    expect(users[0]?.onLeaveToday).toBe(true);
  });
});
