import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  commentCount,
  createComment,
  deleteComment,
  editComment,
  getReactionSummary,
  listComments,
  toggleReaction,
} from "@/lib/interactions";
import { createUpdate } from "@/lib/updates";

const start = new Date("2026-11-17T12:00:00Z"); // 18:00 in Dhaka
const createdUserIds: string[] = [];

async function createUser(name: string): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `interactions-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
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
    avatarFile: user.avatarFile,
  };
}

async function createTargetUpdate(owner: SessionUser): Promise<string> {
  const created = await createUpdate(owner, {
    updateDate: "2026-11-17",
    contentHtml: "<p>Target update</p>",
  });
  if (!created.ok) throw new Error("Could not create target update");
  return created.data.id;
}

async function createLockedUpdate(owner: SessionUser): Promise<string> {
  const update = await prisma.update.create({
    data: {
      userId: owner.id,
      contentHtml: "<p>Old update</p>",
      contentText: "Old update",
      updateDate: new Date("2026-11-16T00:00:00.000Z"),
      postedAt: new Date("2026-11-16T12:00:00.000Z"),
      isLate: false,
    },
  });
  return update.id;
}

afterAll(async () => {
  const updates = await prisma.update.findMany({
    where: { userId: { in: createdUserIds } },
    select: { id: true },
  });
  const updateIds = updates.map((update) => update.id);
  const comments = await prisma.comment.findMany({
    where: {
      OR: [{ userId: { in: createdUserIds } }, { targetId: { in: updateIds } }],
    },
    select: { id: true },
  });
  const commentIds = comments.map((comment) => comment.id);
  const targetIds = [...updateIds, ...commentIds];

  await prisma.reaction.deleteMany({
    where: {
      OR: [{ userId: { in: createdUserIds } }, { targetId: { in: targetIds } }],
    },
  });
  await prisma.mention.deleteMany({
    where: {
      OR: [
        { mentionedUserId: { in: createdUserIds } },
        { targetId: { in: targetIds } },
      ],
    },
  });
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: targetIds } },
  });
  await prisma.comment.deleteMany({ where: { id: { in: commentIds } } });
  await prisma.update.deleteMany({ where: { id: { in: updateIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("comments", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a plain-text comment, stores mentions and audits it", async () => {
    const author = await createUser("Comment Author");
    const owner = await createUser("Update Owner");
    const mentioned = await createUser("Mentioned Person");
    const updateId = await createTargetUpdate(owner);

    const result = await createComment(
      author,
      "update",
      updateId,
      `Hi @[Mentioned](${mentioned.id}) and @[Ghost](00000000-0000-4000-8000-000000000000)`
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.content).toContain("Hi @[Mentioned]");
    expect(result.data.content).not.toContain("<");

    const mentions = await prisma.mention.findMany({
      where: { targetType: "comment", targetId: result.data.id },
    });
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.mentionedUserId).toBe(mentioned.id);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: result.data.id, action: "comment.created" },
    });
    expect(audit).not.toBeNull();
  });

  it("turns a typed @name into a stored mention", async () => {
    const author = await createUser("Typing Author");
    const owner = await createUser("Owner");
    const mentioned = await createUser("Mary Ann Smith");
    const updateId = await createTargetUpdate(owner);

    const created = await createComment(
      author,
      "update",
      updateId,
      "Thanks @Mary Ann Smith for the help"
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.data.content).toContain(
      `@[Mary Ann Smith](${mentioned.id})`
    );

    const mentions = await prisma.mention.findMany({
      where: { targetType: "comment", targetId: created.data.id },
    });
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.mentionedUserId).toBe(mentioned.id);
  });

  it("leaves an unknown @name as plain text", async () => {
    const author = await createUser("Unknown Author");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);

    const created = await createComment(
      author,
      "update",
      updateId,
      "Hello @Nobody Here"
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.data.content).toBe("Hello @Nobody Here");
    expect(
      await prisma.mention.count({
        where: { targetType: "comment", targetId: created.data.id },
      })
    ).toBe(0);
  });

  it("accepts comments on an update that is locked for its owner", async () => {
    const author = await createUser("Commenter");
    const owner = await createUser("Locked Owner");
    const updateId = await createLockedUpdate(owner);

    const result = await createComment(
      author,
      "update",
      updateId,
      "Still allowed"
    );

    expect(result.ok).toBe(true);
  });

  it("edits an own comment on the same Dhaka day", async () => {
    const author = await createUser("Editor");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);
    const created = await createComment(author, "update", updateId, "Original");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const edited = await editComment(author, created.data.id, "Updated");

    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.data.editedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: created.data.id, action: "comment.edited" },
    });
    expect(audit).not.toBeNull();
  });

  it("locks edits and deletes after the Dhaka day changes", async () => {
    const author = await createUser("Late Editor");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);
    const created = await createComment(author, "update", updateId, "Same day");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    vi.setSystemTime(new Date("2026-11-17T19:00:00Z")); // 01:00 next day

    expect(await editComment(author, created.data.id, "Too late")).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await deleteComment(author, created.data.id)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("does not let another user edit or delete a comment", async () => {
    const author = await createUser("Author");
    const other = await createUser("Other");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);
    const created = await createComment(author, "update", updateId, "Mine");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await editComment(other, created.data.id, "Hijack")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteComment(other, created.data.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("soft deletes a comment and removes it from the list", async () => {
    const author = await createUser("Deleter");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);
    const created = await createComment(
      author,
      "update",
      updateId,
      "Delete me"
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await commentCount("update", updateId)).toBe(1);
    expect((await deleteComment(author, created.data.id)).ok).toBe(true);
    expect(await commentCount("update", updateId)).toBe(0);
    expect(await listComments(author.id, "update", updateId)).toEqual([]);
  });

  it("rejects empty content", async () => {
    const author = await createUser("Empty Commenter");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);

    expect(await createComment(author, "update", updateId, "   \n  ")).toEqual({
      ok: false,
      reason: "empty_content",
    });
  });
});

describe("mentions in updates", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores mentions written inside a daily update", async () => {
    const author = await createUser("Update Mentioner");
    const mentioned = await createUser("Update Mentioned");

    const created = await createUpdate(author, {
      updateDate: "2026-11-17",
      contentHtml: `<p>Thanks <span data-mention="${mentioned.id}">@Update Mentioned</span></p>`,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const mentions = await prisma.mention.findMany({
      where: { targetType: "update", targetId: created.data.id },
    });
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.mentionedUserId).toBe(mentioned.id);
  });
});

describe("reactions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("toggles a like on an update and reports who reacted", async () => {
    const actor = await createUser("Reactor");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);

    const added = await toggleReaction(actor, "update", updateId, "like");
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.data).toEqual([
        {
          kind: "like",
          count: 1,
          users: [{ id: actor.id, name: actor.name }],
          reactedByMe: true,
        },
      ]);
    }

    const removed = await toggleReaction(actor, "update", updateId, "like");
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.data).toEqual([]);
  });

  it("moves a like to a dislike instead of holding both", async () => {
    const actor = await createUser("Switcher");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);

    await toggleReaction(actor, "update", updateId, "like");
    const switched = await toggleReaction(actor, "update", updateId, "dislike");

    expect(switched.ok).toBe(true);
    if (switched.ok) {
      expect(switched.data).toHaveLength(1);
      expect(switched.data[0]?.kind).toBe("dislike");
      expect(switched.data[0]?.reactedByMe).toBe(true);
    }

    const rows = await prisma.reaction.findMany({
      where: { targetId: updateId, userId: actor.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("dislike");
  });

  it("keeps one row per person and counts everyone who liked", async () => {
    const first = await createUser("First");
    const second = await createUser("Second");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);

    await toggleReaction(first, "update", updateId, "like");
    await toggleReaction(second, "update", updateId, "like");

    const summary = await getReactionSummary("update", updateId, first.id);
    expect(summary).toHaveLength(1);
    expect(summary[0]?.count).toBe(2);
    expect(summary[0]?.reactedByMe).toBe(true);

    const rows = await prisma.reaction.count({ where: { targetId: updateId } });
    expect(rows).toBe(2);
  });

  it("rejects unsupported reactions and missing targets", async () => {
    const actor = await createUser("Reactor");

    expect(
      await toggleReaction(actor, "update", crypto.randomUUID(), "like")
    ).toEqual({ ok: false, reason: "not_found" });

    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);

    expect(await toggleReaction(actor, "update", updateId, "love")).toEqual({
      ok: false,
      reason: "invalid_reaction",
    });
  });

  it("supports reactions on comments", async () => {
    const actor = await createUser("Comment Reactor");
    const owner = await createUser("Owner");
    const updateId = await createTargetUpdate(owner);
    const comment = await createComment(
      actor,
      "update",
      updateId,
      "React to me"
    );
    expect(comment.ok).toBe(true);
    if (!comment.ok) return;

    const result = await toggleReaction(
      actor,
      "comment",
      comment.data.id,
      "dislike"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.kind).toBe("dislike");
      expect(result.data[0]?.count).toBe(1);
    }

    const comments = await listComments(owner.id, "update", updateId);
    expect(comments[0]?.reactions[0]?.kind).toBe("dislike");
    expect(comments[0]?.reactions[0]?.reactedByMe).toBe(false);
  });
});
