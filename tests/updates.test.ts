import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  createUpdate,
  deleteUpdate,
  editUpdate,
  getMyUpdateForDate,
  listMyUpdates,
} from "@/lib/updates";

const createdUserIds: string[] = [];
const start = new Date("2026-11-17T12:00:00Z"); // 18:00 in Dhaka on 17 Nov

async function createActor(name = "Update Tester"): Promise<SessionUser> {
  const email = `updates-test-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  const user = await prisma.user.create({
    data: {
      name,
      email,
      department: "IT",
      position: "Tester",
      role: Role.Employee,
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

afterAll(async () => {
  const updates = await prisma.update.findMany({
    where: { userId: { in: createdUserIds } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: updates.map((update) => update.id) } },
  });
  await prisma.update.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.session.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("daily updates", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates today's update with sanitized content and plain text", async () => {
    const actor = await createActor();

    const result = await createUpdate(actor, {
      updateDate: "2026-11-17",
      contentHtml:
        "<p>Hello <strong>world</strong></p><script>alert(1)</script>",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.isLate).toBe(false);
      expect(result.data.canEdit).toBe(true);
    }

    const stored = await prisma.update.findFirst({
      where: { userId: actor.id },
    });
    expect(stored?.contentText).toBe("Hello world");
    expect(stored?.contentHtml).not.toContain("script");
    expect(stored?.postedAt.getTime()).toBe(start.getTime());

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: stored!.id, action: "update.created" },
    });
    expect(audit).not.toBeNull();
  });

  it("marks a past date as late", async () => {
    const actor = await createActor();

    const result = await createUpdate(actor, {
      updateDate: "2026-11-15",
      contentHtml: "<p>Two days ago</p>",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.isLate).toBe(true);
  });

  it("rejects a future date", async () => {
    const actor = await createActor();

    expect(
      await createUpdate(actor, {
        updateDate: "2026-11-18",
        contentHtml: "<p>Tomorrow</p>",
      }),
    ).toEqual({ ok: false, reason: "future_date" });
  });

  it("allows only one update per date", async () => {
    const actor = await createActor();

    await createUpdate(actor, {
      updateDate: "2026-11-17",
      contentHtml: "<p>First</p>",
    });

    expect(
      await createUpdate(actor, {
        updateDate: "2026-11-17",
        contentHtml: "<p>Second</p>",
      }),
    ).toEqual({ ok: false, reason: "duplicate" });
  });

  it("rejects content that is empty after sanitizing", async () => {
    const actor = await createActor();

    expect(
      await createUpdate(actor, {
        updateDate: "2026-11-17",
        contentHtml: "<p></p><script>alert(1)</script>",
      }),
    ).toEqual({ ok: false, reason: "empty_content" });
  });

  it("edits an update posted earlier the same Dhaka day", async () => {
    const actor = await createActor();
    const created = await createUpdate(actor, {
      updateDate: "2026-11-17",
      contentHtml: "<p>Original</p>",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const edited = await editUpdate(actor, created.data.id, {
      contentHtml: "<p>Updated <em>text</em></p>",
    });

    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.data.editedAt).not.toBeNull();

    const stored = await prisma.update.findUnique({
      where: { id: created.data.id },
    });
    expect(stored?.contentText).toBe("Updated text");

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: created.data.id, action: "update.edited" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses edits and deletes after the Dhaka day changes", async () => {
    const actor = await createActor();
    const created = await createUpdate(actor, {
      updateDate: "2026-11-17",
      contentHtml: "<p>Posted before midnight</p>",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // 01:00 on 18 Nov in Dhaka.
    vi.setSystemTime(new Date("2026-11-17T19:00:00Z"));

    expect(
      await editUpdate(actor, created.data.id, {
        contentHtml: "<p>Too late</p>",
      }),
    ).toEqual({ ok: false, reason: "locked" });

    expect(await deleteUpdate(actor, created.data.id)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("soft deletes an update made the same day", async () => {
    const actor = await createActor();
    const created = await createUpdate(actor, {
      updateDate: "2026-11-17",
      contentHtml: "<p>Delete me</p>",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect((await deleteUpdate(actor, created.data.id)).ok).toBe(true);

    const stored = await prisma.update.findUnique({
      where: { id: created.data.id },
    });
    expect(stored?.deletedAt).not.toBeNull();
    expect(await getMyUpdateForDate(actor.id, "2026-11-17")).toBeNull();
    expect(await listMyUpdates(actor.id)).toEqual([]);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: created.data.id, action: "update.deleted" },
    });
    expect(audit).not.toBeNull();
  });

  it("does not let another user edit or delete the update", async () => {
    const owner = await createActor("Owner");
    const other = await createActor("Other");
    const created = await createUpdate(owner, {
      updateDate: "2026-11-17",
      contentHtml: "<p>Mine</p>",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(
      await editUpdate(other, created.data.id, {
        contentHtml: "<p>Hijacked</p>",
      }),
    ).toEqual({ ok: false, reason: "not_found" });

    expect(await deleteUpdate(other, created.data.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("reports canEdit based on the current Dhaka day", async () => {
    const actor = await createActor();
    await createUpdate(actor, {
      updateDate: "2026-11-17",
      contentHtml: "<p>Today</p>",
    });

    const today = await getMyUpdateForDate(actor.id, "2026-11-17");
    expect(today?.canEdit).toBe(true);

    vi.setSystemTime(new Date("2026-11-17T19:00:00Z"));

    const nextDay = await getMyUpdateForDate(actor.id, "2026-11-17");
    expect(nextDay?.canEdit).toBe(false);
  });

  it("lists updates newest date first", async () => {
    const actor = await createActor();
    await createUpdate(actor, {
      updateDate: "2026-11-16",
      contentHtml: "<p>Yesterday-ish</p>",
    });
    await createUpdate(actor, {
      updateDate: "2026-11-17",
      contentHtml: "<p>Today</p>",
    });

    const updates = await listMyUpdates(actor.id);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.updateDate.toISOString().slice(0, 10)).toBe(
      "2026-11-17",
    );
  });
});
