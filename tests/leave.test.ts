import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { markLeave, listLeaves } from "@/lib/leaves";
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

describe("leave marking", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a user mark their own leave", async () => {
    const user = await createUser("Self Leave");

    const result = await markLeave(user, {
      fromDate: "2026-11-17",
      toDate: "2026-11-18",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      createdLeaveIds.push(result.leave.id);
      expect(result.leave.userId).toBe(user.id);
    }

    const todayLeave = await getOnLeaveUserIds("2026-11-17");
    const yesterdayLeave = await getOnLeaveUserIds("2026-11-16");
    expect(todayLeave.has(user.id)).toBe(true);
    expect(yesterdayLeave.has(user.id)).toBe(false);
  });

  it("blocks Employees from marking leave for someone else", async () => {
    const employee = await createUser("Employee");
    const other = await createUser("Other");

    expect(
      await markLeave(employee, {
        userId: other.id,
        fromDate: "2026-11-17",
        toDate: "2026-11-17",
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("lets Manager, HR and Admin mark leave for others", async () => {
    const manager = await createUser("Manager", Role.Manager);
    const target = await createUser("Target");

    const result = await markLeave(manager, {
      userId: target.id,
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      createdLeaveIds.push(result.leave.id);
      expect(result.leave.createdBy.id).toBe(manager.id);
      expect(result.leave.userId).toBe(target.id);
    }
  });

  it("rejects an inverted range and inactive users", async () => {
    const manager = await createUser("Manager", Role.Manager);
    const disabled = await createUser(
      "Disabled",
      Role.Employee,
      UserStatus.Disabled,
    );

    expect(
      await markLeave(manager, {
        fromDate: "2026-11-18",
        toDate: "2026-11-17",
      }),
    ).toEqual({ ok: false, reason: "invalid_range" });

    expect(
      await markLeave(manager, {
        userId: disabled.id,
        fromDate: "2026-11-17",
        toDate: "2026-11-17",
      }),
    ).toEqual({ ok: false, reason: "invalid_user" });
  });

  it("shows all leaves to approvers and only own leaves to employees", async () => {
    const employee = await createUser("Employee");
    const manager = await createUser("Manager", Role.Manager);
    const target = await createUser("Target");

    const first = await markLeave(employee, {
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
    });
    const second = await markLeave(manager, {
      userId: target.id,
      fromDate: "2026-11-17",
      toDate: "2026-11-18",
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
    const leave = await markLeave(onLeave, {
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
    });
    if (leave.ok) createdLeaveIds.push(leave.leave.id);

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
    const leave = await markLeave(user, {
      fromDate: "2026-11-17",
      toDate: "2026-11-17",
    });
    if (leave.ok) createdLeaveIds.push(leave.leave.id);

    const users = await searchUsers(user.email);
    expect(users[0]?.onLeaveToday).toBe(true);
  });
});
