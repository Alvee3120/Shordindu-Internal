import { afterAll, describe, expect, it } from "vitest";
import { Role, UserStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "@/lib/announcements";
import type { EmailPayload } from "@/lib/email";

const createdUserIds: string[] = [];
const createdAnnouncementIds: string[] = [];

function freshEmail(label: string): string {
  return `ann-test-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
}

async function createUser({
  name = "Test User",
  role = Role.Employee,
  status = UserStatus.Active,
}: {
  name?: string;
  role?: Role;
  status?: UserStatus;
} = {}): Promise<User> {
  const user = await prisma.user.create({
    data: {
      name,
      email: freshEmail("user"),
      department: "IT",
      position: "Tester",
      role,
      status,
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function asActor(user: User): SessionUser {
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

async function trackAnnouncement(id: string): Promise<void> {
  createdAnnouncementIds.push(id);
}

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: createdAnnouncementIds } },
  });
  await prisma.announcement.deleteMany({
    where: { id: { in: createdAnnouncementIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("createAnnouncement", () => {
  it("lets Admin, HR and Manager post", async () => {
    for (const [role, roleName] of [
      [Role.Admin, "Admin"],
      [Role.HR, "HR"],
      [Role.Manager, "Manager"],
    ] as const) {
      const actor = await createUser({ name: roleName, role });
      const result = await createAnnouncement(asActor(actor), {
        title: `${roleName} notice`,
        contentHtml: "<p>Important information</p>",
      });

      expect(result.ok, `role=${roleName}`).toBe(true);
      if (result.ok) await trackAnnouncement(result.data.id);
    }
  });

  it("rejects an Employee", async () => {
    const actor = await createUser({ role: Role.Employee });
    const result = await createAnnouncement(asActor(actor), {
      title: "Not allowed",
      contentHtml: "<p>Nope</p>",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("rejects markup that carries no text", async () => {
    const actor = await createUser({ role: Role.HR });
    const result = await createAnnouncement(asActor(actor), {
      title: "Empty body",
      contentHtml: "<p> </p>",
    });

    expect(result).toEqual({ ok: false, reason: "empty_content" });
  });

  it("strips media and scripts from the stored body", async () => {
    const actor = await createUser({ role: Role.Manager });
    const result = await createAnnouncement(asActor(actor), {
      title: "Sanitised",
      contentHtml:
        '<p>Hello</p><img src="x.png"><script>alert(1)</script><iframe src="x"></iframe>',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await trackAnnouncement(result.data.id);

    expect(result.data.contentHtml).toBe("<p>Hello</p>");
  });
});

describe("announcement notification", () => {
  it("emails every other Active user exactly once and excludes the author", async () => {
    const author = await createUser({ name: "Author", role: Role.HR });
    const first = await createUser({ name: "First" });
    const second = await createUser({ name: "Second" });
    const disabled = await createUser({
      name: "Disabled",
      status: UserStatus.Disabled,
    });

    const sent: EmailPayload[] = [];
    const result = await createAnnouncement(
      asActor(author),
      {
        title: "Email check",
        contentHtml: "<p>Read this</p>",
        sendEmail: true,
      },
      async (payload) => {
        sent.push(payload);
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await trackAnnouncement(result.data.id);

    const recipients = sent.map((payload) => payload.to);
    expect(recipients).toContain(first.email);
    expect(recipients).toContain(second.email);
    expect(recipients).not.toContain(author.email);
    expect(recipients).not.toContain(disabled.email);
    expect(new Set(recipients).size).toBe(recipients.length);

    const notification = await prisma.notification.findFirst({
      where: { userId: first.id, type: "announcement" },
    });
    expect(notification?.link).toBe(
      `/announcements#announcement-${result.data.id}`
    );
    expect(notification?.emailedAt).not.toBeNull();
  });

  it("does not email unless the author opts in", async () => {
    const author = await createUser({ name: "Quiet Author", role: Role.HR });
    const reader = await createUser({ name: "Quiet Reader" });

    const sent: EmailPayload[] = [];
    const result = await createAnnouncement(
      asActor(author),
      { title: "In-app only", contentHtml: "<p>Visible in the app</p>" },
      async (payload) => {
        sent.push(payload);
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await trackAnnouncement(result.data.id);

    expect(sent).toHaveLength(0);

    const notification = await prisma.notification.findFirst({
      where: { userId: reader.id, type: "announcement" },
    });
    expect(notification).not.toBeNull();
    expect(notification?.emailedAt).not.toBeNull();
  });
});

describe("updateAnnouncement and deleteAnnouncement", () => {
  it("edits on the same Dhaka day", async () => {
    const actor = await createUser({ role: Role.Admin });
    const created = await createAnnouncement(asActor(actor), {
      title: "Original",
      contentHtml: "<p>First version</p>",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await trackAnnouncement(created.data.id);

    const updated = await updateAnnouncement(asActor(actor), created.data.id, {
      title: "Updated",
    });

    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.title).toBe("Updated");
  });

  it("locks edits made on a later Dhaka day", async () => {
    const actor = await createUser({ role: Role.Admin });
    const created = await createAnnouncement(asActor(actor), {
      title: "Yesterday's notice",
      contentHtml: "<p>Old</p>",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await trackAnnouncement(created.data.id);

    // Backdate the row so it belongs to the previous Dhaka day.
    await prisma.announcement.update({
      where: { id: created.data.id },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });

    const updated = await updateAnnouncement(asActor(actor), created.data.id, {
      title: "Too late",
    });
    const removed = await deleteAnnouncement(asActor(actor), created.data.id);

    expect(updated).toEqual({ ok: false, reason: "locked" });
    expect(removed).toEqual({ ok: false, reason: "locked" });
  });

  it("soft deletes and hides the announcement from the list", async () => {
    const actor = await createUser({ role: Role.HR });
    const created = await createAnnouncement(asActor(actor), {
      title: "Temporary",
      contentHtml: "<p>Gone soon</p>",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await trackAnnouncement(created.data.id);

    const removed = await deleteAnnouncement(asActor(actor), created.data.id);
    expect(removed.ok).toBe(true);

    const listed = await listAnnouncements(asActor(actor));
    expect(listed.some((item) => item.id === created.data.id)).toBe(false);

    const row = await prisma.announcement.findUnique({
      where: { id: created.data.id },
    });
    expect(row?.deletedAt).not.toBeNull();
  });
});
