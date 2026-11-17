import { afterAll, describe, expect, it } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listAuditLog } from "@/lib/audit";

const createdUserIds: string[] = [];
const targetPrefix = `audit-test-${Date.now()}`;
const createdTargets: string[] = [];

async function createUser(name: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `audit-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      department: "IT",
      position: "Tester",
      role: Role.Admin,
      status: UserStatus.Active,
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function addEntry(
  label: string,
  {
    actorId,
    action,
    createdAt,
  }: { actorId: string | null; action: string; createdAt: string },
): Promise<string> {
  const targetId = `${targetPrefix}-${label}`;
  createdTargets.push(targetId);
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      targetType: "test",
      targetId,
      beforeJson: { step: "before" },
      afterJson: { step: "after" },
      createdAt: new Date(createdAt),
    },
  });
  return targetId;
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: createdTargets } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("listAuditLog", () => {
  it("filters by Dhaka calendar date, actor, action and system entries", async () => {
    const firstActor = await createUser("Audit First");
    const secondActor = await createUser("Audit Second");

    const older = await addEntry("older", {
      actorId: firstActor,
      action: "test.action.one",
      createdAt: "2026-11-16T12:00:00.000Z", // 16 Nov in Dhaka
    });
    const midday = await addEntry("midday", {
      actorId: secondActor,
      action: "test.action.two",
      createdAt: "2026-11-17T12:00:00.000Z", // 17 Nov in Dhaka
    });
    const lateNight = await addEntry("late", {
      actorId: firstActor,
      action: "test.action.two",
      createdAt: "2026-11-17T19:00:00.000Z", // 18 Nov in Dhaka
    });
    const evening = await addEntry("evening", {
      actorId: firstActor,
      action: "test.action.three",
      createdAt: "2026-11-17T15:00:00.000Z", // 17 Nov in Dhaka
    });
    const system = await addEntry("system", {
      actorId: null,
      action: "test.action.four",
      createdAt: "2026-11-17T16:00:00.000Z",
    });

    const day = await listAuditLog(
      { from: "2026-11-17", to: "2026-11-17" },
      1,
      50,
    );
    const dayIds = day.entries.map((entry) => entry.targetId);
    expect(dayIds).toContain(system);
    expect(dayIds).toContain(evening);
    expect(dayIds).toContain(midday);
    expect(dayIds).not.toContain(lateNight);
    expect(dayIds).not.toContain(older);

    const byActor = await listAuditLog(
      { actorId: firstActor },
      1,
      50,
    );
    const actorIds = byActor.entries.map((entry) => entry.targetId);
    expect(actorIds).toContain(older);
    expect(actorIds).toContain(lateNight);
    expect(actorIds).toContain(evening);
    expect(actorIds).not.toContain(midday);

    const byAction = await listAuditLog(
      { action: "test.action.two" },
      1,
      50,
    );
    expect(byAction.entries.map((entry) => entry.targetId).sort()).toEqual(
      [lateNight, midday].sort(),
    );

    const systemOnly = await listAuditLog({ actorId: "system" }, 1, 50);
    expect(systemOnly.entries.map((entry) => entry.targetId)).toContain(system);
  });

  it("paginates newest first and exposes filter options", async () => {
    const actor = await createUser("Audit Pager");
    const ids: string[] = [];
    for (let index = 1; index <= 5; index++) {
      ids.push(
        await addEntry(`page-${index}`, {
          actorId: actor,
          action: `test.page.${index}`,
          createdAt: `2026-11-17T0${index}:00:00.000Z`,
        }),
      );
    }

    const pageOne = await listAuditLog({ actorId: actor }, 1, 2);
    const pageTwo = await listAuditLog({ actorId: actor }, 2, 2);
    const pageThree = await listAuditLog({ actorId: actor }, 3, 2);

    expect(pageOne.entries).toHaveLength(2);
    expect(pageTwo.entries).toHaveLength(2);
    expect(pageThree.entries).toHaveLength(1);
    expect(pageOne.pageCount).toBe(3);
    expect(pageOne.entries[0]?.targetId).toBe(ids[4]);
    expect(pageOne.actions).toEqual(
      expect.arrayContaining(["test.page.1", "test.page.5"]),
    );
    expect(pageOne.users.some((user) => user.id === actor)).toBe(true);
    expect(pageOne.entries[0]?.beforeJson).toEqual({ step: "before" });
  });
});
