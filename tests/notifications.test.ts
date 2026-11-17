import { afterAll, describe, expect, it } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  createNotifications,
  notifyAssignmentCreated,
  notifyCommentCreated,
  notifyUpdateMentions,
} from "@/lib/notifications";
import { processPendingDigests } from "@/jobs/digest";
import type { EmailPayload } from "@/lib/email";

const createdUserIds: string[] = [];
const createdUpdateIds: string[] = [];
const createdAssignmentIds: string[] = [];

async function createUser(
  name: string,
  status: UserStatus = UserStatus.Active,
): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `notifications-test-${Date.now()}-${Math.random()
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

async function createUpdate(userId: string): Promise<string> {
  const update = await prisma.update.create({
    data: {
      userId,
      contentHtml: "<p>Notification target</p>",
      contentText: "Notification target",
      updateDate: new Date("2026-11-17T00:00:00.000Z"),
      postedAt: new Date(),
      isLate: false,
    },
  });
  createdUpdateIds.push(update.id);
  return update.id;
}

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.mention.deleteMany({
    where: { mentionedUserId: { in: createdUserIds } },
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
  await prisma.update.deleteMany({ where: { id: { in: createdUpdateIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("notification creation", () => {
  it("skips the actor and duplicate entries", async () => {
    const actor = await createUser("Actor");
    const target = await createUser("Target");

    const created = await createNotifications(actor.id, [
      {
        userId: actor.id,
        type: "comment",
        message: "own action",
        link: "/",
      },
      {
        userId: target.id,
        type: "comment",
        message: "first",
        link: "/#update-1",
      },
      {
        userId: target.id,
        type: "comment",
        message: "duplicate",
        link: "/#update-1",
      },
    ]);

    expect(created).toBe(1);
    const rows = await prisma.notification.findMany({
      where: { userId: target.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("first");
  });

  it("notifies the update owner and mentioned people after a comment", async () => {
    const actor = await createUser("Commenter");
    const owner = await createUser("Owner");
    const mentioned = await createUser("Mentioned");
    const updateId = await createUpdate(owner.id);

    await notifyCommentCreated({
      actor,
      targetType: "update",
      targetId: updateId,
      contentHtml: `<p><span data-mention="${mentioned.id}">@Mentioned</span></p>`,
    });

    const ownerRows = await prisma.notification.findMany({
      where: { userId: owner.id },
    });
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0]?.type).toBe("comment");
    expect(ownerRows[0]?.link).toBe(`/#update-${updateId}`);

    const mentionRows = await prisma.notification.findMany({
      where: { userId: mentioned.id },
    });
    expect(mentionRows).toHaveLength(1);
    expect(mentionRows[0]?.type).toBe("mention");
  });

  it("does not notify the owner about their own comment", async () => {
    const owner = await createUser("Self Commenter");
    const updateId = await createUpdate(owner.id);

    await notifyCommentCreated({
      actor: owner,
      targetType: "update",
      targetId: updateId,
      contentHtml: "<p>Talking to myself</p>",
    });

    const rows = await prisma.notification.findMany({
      where: { userId: owner.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("notifies the assignment creator and assignees", async () => {
    const actor = await createUser("Assignment Commenter");
    const creator = await createUser("Assignment Creator");
    const assignee = await createUser("Assignment Assignee");

    const assignment = await prisma.assignment.create({
      data: {
        createdById: creator.id,
        contentHtml: "<p>Do the thing</p>",
      },
    });
    createdAssignmentIds.push(assignment.id);
    await prisma.assignmentAssignee.create({
      data: { assignmentId: assignment.id, userId: assignee.id },
    });

    await notifyCommentCreated({
      actor,
      targetType: "assignment",
      targetId: assignment.id,
      contentHtml: "<p>Any update?</p>",
    });

    expect(
      await prisma.notification.count({ where: { userId: creator.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId: assignee.id } }),
    ).toBe(1);
  });

  it("notifies mentions inside a daily update", async () => {
    const actor = await createUser("Update Writer");
    const mentioned = await createUser("Update Mentioned");
    const updateId = await createUpdate(actor.id);

    await notifyUpdateMentions({
      actor,
      updateId,
      contentHtml: `<p><span data-mention="${mentioned.id}">@Update Mentioned</span></p>`,
    });

    const rows = await prisma.notification.findMany({
      where: { userId: mentioned.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toContain("daily update");
  });

  it("creates assignment received notifications for assignees only", async () => {
    const actor = await createUser("Assigner");
    const first = await createUser("Assignee One");
    const second = await createUser("Assignee Two");

    await notifyAssignmentCreated({
      actor,
      assignmentId: "00000000-0000-4000-8000-000000000000",
      assigneeIds: [first.id, second.id, actor.id],
      summary: "Prepare the monthly report",
    });

    expect(
      await prisma.notification.count({ where: { userId: first.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId: second.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId: actor.id } }),
    ).toBe(0);
  });
});

describe("notification digest", () => {
  it("batches a user's notifications into one email and marks them sent", async () => {
    const user = await createUser("Digest User");
    const disabled = await createUser("Disabled User", UserStatus.Disabled);

    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          type: "comment",
          message: "First notification",
          link: "/#update-one",
        },
        {
          userId: user.id,
          type: "mention",
          message: "Second notification",
          link: "/#update-two",
        },
        {
          userId: disabled.id,
          type: "comment",
          message: "Blocked notification",
          link: "/",
        },
      ],
    });

    const sent: EmailPayload[] = [];
    const result = await processPendingDigests(
      async (payload) => {
        sent.push(payload);
      },
      { userIds: [user.id, disabled.id] },
    );

    expect(result).toEqual({ emails: 1, notifications: 3 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(user.email);
    expect(sent[0]?.subject).toContain("2 new notifications");
    expect(sent[0]?.html).toContain("First notification");
    expect(sent[0]?.html).toContain("Second notification");
    expect(sent[0]?.text).toContain("/#update-one");

    const rows = await prisma.notification.findMany({
      where: { userId: { in: [user.id, disabled.id] } },
    });
    expect(rows.every((row) => row.emailedAt !== null)).toBe(true);

    const secondRun = await processPendingDigests(
      async () => {
        throw new Error("should not send again");
      },
      { userIds: [user.id, disabled.id] },
    );
    expect(secondRun).toEqual({ emails: 0, notifications: 0 });
  });
});
