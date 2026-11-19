import { afterAll, describe, expect, it } from "vitest";
import { Role, TargetType, UserStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  createMessage,
  deleteMessage,
  editMessage,
  listMessages,
  listChanges,
  markChatRead,
  unreadCount,
} from "@/lib/chat";

const createdUserIds: string[] = [];
const createdMessageIds: string[] = [];

function freshEmail(label: string): string {
  return `chat-test-${label}-${Date.now()}-${Math.random()
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

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.chatRead.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.mention.deleteMany({
    where: {
      targetType: TargetType.chatMessage,
      targetId: { in: createdMessageIds },
    },
  });
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: createdMessageIds } },
  });
  await prisma.chatMessage.deleteMany({
    where: { id: { in: createdMessageIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("createMessage", () => {
  it("lets any role post to the shared room", async () => {
    const employee = await createUser({ name: "Employee", role: Role.Employee });

    const result = await createMessage(asActor(employee), "Hello everyone");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdMessageIds.push(result.data.id);
    expect(result.data.content).toBe("Hello everyone");
    expect(result.data.author.id).toBe(employee.id);
  });

  it("rejects an empty message", async () => {
    const user = await createUser();
    const result = await createMessage(asActor(user), "   ");

    expect(result).toEqual({ ok: false, reason: "empty_content" });
  });

  it("stores mentions and notifies only the mentioned people", async () => {
    const author = await createUser({ name: "Author" });
    const mentioned = await createUser({ name: "Mentioned One" });
    const bystander = await createUser({ name: "Bystander" });

    const result = await createMessage(
      asActor(author),
      "Hello @Mentioned One, please check this"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdMessageIds.push(result.data.id);

    // Stored as a mention token the UI renders back as a highlighted name.
    expect(result.data.content).toBe(
      `Hello @[Mentioned One](${mentioned.id}), please check this`
    );

    const mentions = await prisma.mention.findMany({
      where: {
        targetType: TargetType.chatMessage,
        targetId: result.data.id,
      },
    });
    expect(mentions.map((mention) => mention.mentionedUserId)).toEqual([
      mentioned.id,
    ]);

    const notified = await prisma.notification.findMany({
      where: {
        type: "chat_mention",
        userId: { in: [mentioned.id, bystander.id, author.id] },
      },
      select: { userId: true },
    });
    expect(notified.map((row) => row.userId)).toEqual([mentioned.id]);
  });

  it("keeps typed markup literal so nothing can run", async () => {
    const user = await createUser();
    const result = await createMessage(
      asActor(user),
      "<script>alert(1)</script>hi"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdMessageIds.push(result.data.id);
    expect(result.data.content).toBe("<script>alert(1)</script>hi");
  });
});

describe("listMessages", () => {
  it("returns the newest page oldest-first and pages backwards", async () => {
    const user = await createUser({ name: "Pager" });
    const posted: string[] = [];

    for (let index = 0; index < 5; index++) {
      const result = await createMessage(asActor(user), `message ${index}`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        createdMessageIds.push(result.data.id);
        posted.push(result.data.id);
      }
    }

    const first = await listMessages(asActor(user), { limit: 2 });
    expect(first.messages).toHaveLength(2);
    // Newest last, so the UI can append downwards.
    expect(first.messages.map((message) => message.id)).toEqual(
      posted.slice(-2)
    );
    expect(first.nextCursor).not.toBeNull();

    const second = await listMessages(asActor(user), {
      limit: 2,
      before: first.nextCursor!,
    });
    expect(second.messages.map((message) => message.id)).toEqual(
      posted.slice(-4, -2)
    );
  });

  it("returns only newer messages to the poller", async () => {
    const user = await createUser({ name: "Poller" });
    const first = await createMessage(asActor(user), "older");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    createdMessageIds.push(first.data.id);

    // Take the cursor as a client would, right after the first message.
    const anchor = await listMessages(asActor(user));
    const cursor = anchor.syncCursor!;
    expect(cursor).not.toBeNull();

    const second = await createMessage(asActor(user), "newer");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    createdMessageIds.push(second.data.id);

    const delta = await listChanges(
      asActor(user),
      new Date(cursor.updatedAt),
      cursor.id
    );

    expect(delta.messages.map((message) => message.id)).toContain(
      second.data.id
    );
    expect(delta.messages.map((message) => message.id)).not.toContain(
      first.data.id
    );
  });

  it("reports edits made by another user so clients can refresh in place", async () => {
    const author = await createUser({ name: "Edit Author" });
    const reader = await createUser({ name: "Edit Reader" });

    const created = await createMessage(asActor(author), "original wording");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdMessageIds.push(created.data.id);

    const anchor = await listMessages(asActor(reader));
    const cursor = anchor.syncCursor!;

    const updated = await editMessage(
      asActor(author),
      created.data.id,
      "corrected wording"
    );
    expect(updated.ok).toBe(true);

    const delta = await listChanges(
      asActor(reader),
      new Date(cursor.updatedAt),
      cursor.id
    );

    const changed = delta.messages.find(
      (message) => message.id === created.data.id
    );
    expect(changed?.content).toBe("corrected wording");
    expect(changed?.editedAt).not.toBeNull();
  });

  it("reports deletions as tombstones so clients can drop them", async () => {
    const author = await createUser({ name: "Delete Author" });
    const reader = await createUser({ name: "Delete Reader" });

    const created = await createMessage(asActor(author), "remove me soon");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdMessageIds.push(created.data.id);

    const anchor = await listMessages(asActor(reader));
    const cursor = anchor.syncCursor!;

    const removed = await deleteMessage(asActor(author), created.data.id);
    expect(removed.ok).toBe(true);

    const delta = await listChanges(
      asActor(reader),
      new Date(cursor.updatedAt),
      cursor.id
    );

    expect(delta.deletedIds).toContain(created.data.id);
    expect(delta.messages.map((message) => message.id)).not.toContain(
      created.data.id
    );
  });
});

describe("editMessage and deleteMessage", () => {
  it("edits your own message on the same Dhaka day", async () => {
    const user = await createUser({ name: "Editor" });
    const created = await createMessage(asActor(user), "first draft");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdMessageIds.push(created.data.id);

    const updated = await editMessage(
      asActor(user),
      created.data.id,
      "fixed wording"
    );

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.data.content).toBe("fixed wording");
      expect(updated.data.editedAt).not.toBeNull();
    }
  });

  it("refuses to edit someone else's message", async () => {
    const author = await createUser({ name: "Owner" });
    const other = await createUser({ name: "Intruder" });
    const created = await createMessage(asActor(author), "mine");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdMessageIds.push(created.data.id);

    const updated = await editMessage(asActor(other), created.data.id, "hacked");

    expect(updated).toEqual({ ok: false, reason: "not_found" });
  });

  it("locks edits after the Dhaka day ends", async () => {
    const user = await createUser({ name: "Late Editor" });
    const created = await createMessage(asActor(user), "yesterday");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdMessageIds.push(created.data.id);

    await prisma.chatMessage.update({
      where: { id: created.data.id },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });

    const updated = await editMessage(asActor(user), created.data.id, "too late");
    const removed = await deleteMessage(asActor(user), created.data.id);

    expect(updated).toEqual({ ok: false, reason: "locked" });
    expect(removed).toEqual({ ok: false, reason: "locked" });
  });

  it("soft deletes and hides the message from the room", async () => {
    const user = await createUser({ name: "Deleter" });
    const created = await createMessage(asActor(user), "remove me");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdMessageIds.push(created.data.id);

    const removed = await deleteMessage(asActor(user), created.data.id);
    expect(removed.ok).toBe(true);

    const room = await listMessages(asActor(user), { limit: 100 });
    expect(room.messages.some((message) => message.id === created.data.id)).toBe(
      false
    );

    const row = await prisma.chatMessage.findUnique({
      where: { id: created.data.id },
    });
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe("unread count for the floating button", () => {
  it("counts other people's new messages and resets once read", async () => {
    const reader = await createUser({ name: "Unread Reader" });
    const writer = await createUser({ name: "Unread Writer" });

    // Start from a clean marker so earlier tests do not leak in.
    await markChatRead(reader.id);

    const first = await createMessage(asActor(writer), "hello there");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    createdMessageIds.push(first.data.id);

    expect(await unreadCount(reader.id)).toBe(1);

    await markChatRead(reader.id);
    expect(await unreadCount(reader.id)).toBe(0);

    const second = await createMessage(asActor(writer), "one more");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    createdMessageIds.push(second.data.id);

    expect(await unreadCount(reader.id)).toBe(1);
  });

  it("never counts the viewer's own messages", async () => {
    const user = await createUser({ name: "Self Talker" });
    await markChatRead(user.id);

    const own = await createMessage(asActor(user), "talking to myself");
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    createdMessageIds.push(own.data.id);

    expect(await unreadCount(user.id)).toBe(0);
  });

  it("does not count soft-deleted messages", async () => {
    const reader = await createUser({ name: "Unread Reader Two" });
    const writer = await createUser({ name: "Unread Writer Two" });
    await markChatRead(reader.id);

    const created = await createMessage(asActor(writer), "temporary");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdMessageIds.push(created.data.id);

    expect(await unreadCount(reader.id)).toBe(1);

    await prisma.chatMessage.update({
      where: { id: created.data.id },
      data: { deletedAt: new Date() },
    });

    expect(await unreadCount(reader.id)).toBe(0);
  });
});
