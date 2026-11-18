import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { extractMentionIds, extractMentionIdsFromText } from "@/lib/mentions";
import type { SessionUser } from "@/lib/auth";

export interface NotificationDraft {
  userId: string;
  type: string;
  message: string;
  link: string;
}

/**
 * Inserts notifications, skipping the actor's own actions and duplicates for
 * the same user, type and link.
 */
export async function createNotifications(
  actorId: string | null,
  drafts: NotificationDraft[]
): Promise<number> {
  const seen = new Set<string>();
  const rows = drafts.filter((draft) => {
    if (draft.userId === actorId) return false;
    const key = `${draft.userId}:${draft.type}:${draft.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (rows.length === 0) return 0;

  await prisma.notification.createMany({ data: rows });
  return rows.length;
}

async function activeMentionIds(html: string): Promise<string[]> {
  const ids = extractMentionIds(html);
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, status: UserStatus.Active },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Same as activeMentionIds, for plain-text comment content. */
async function activeMentionIdsFromComment(text: string): Promise<string[]> {
  const ids = extractMentionIdsFromText(text);
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, status: UserStatus.Active },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Notifies the owner plus anyone mentioned after a comment is created. */
export async function notifyCommentCreated({
  actor,
  targetType,
  targetId,
  content,
}: {
  actor: SessionUser;
  targetType: "update" | "assignment";
  targetId: string;
  content: string;
}): Promise<number> {
  const mentionIds = await activeMentionIdsFromComment(content);
  const drafts: NotificationDraft[] = [];
  const alreadyNotified = new Set<string>();

  if (targetType === "update") {
    const update = await prisma.update.findUnique({
      where: { id: targetId },
      select: { userId: true, deletedAt: true },
    });
    if (!update || update.deletedAt) return 0;

    drafts.push({
      userId: update.userId,
      type: "comment",
      message: `${actor.name} commented on your update`,
      link: `/#update-${targetId}`,
    });
    alreadyNotified.add(update.userId);
  } else {
    const assignment = await prisma.assignment.findUnique({
      where: { id: targetId },
      select: {
        createdById: true,
        deletedAt: true,
        assignees: { where: { removedAt: null }, select: { userId: true } },
      },
    });
    if (!assignment || assignment.deletedAt) return 0;

    const recipients = new Set<string>([
      assignment.createdById,
      ...assignment.assignees.map((assignee) => assignee.userId),
    ]);
    for (const userId of Array.from(recipients)) {
      drafts.push({
        userId,
        type: "comment",
        message: `${actor.name} commented on an assignment`,
        link: `/assignments#assignment-${targetId}`,
      });
      alreadyNotified.add(userId);
    }
  }

  for (const userId of mentionIds) {
    if (alreadyNotified.has(userId)) continue;
    drafts.push({
      userId,
      type: "mention",
      message: `${actor.name} mentioned you in a comment`,
      link:
        targetType === "update"
          ? `/#update-${targetId}`
          : `/assignments#assignment-${targetId}`,
    });
  }

  return createNotifications(actor.id, drafts);
}

/** Notifies people mentioned inside a daily update. */
export async function notifyUpdateMentions({
  actor,
  updateId,
  contentHtml,
}: {
  actor: SessionUser;
  updateId: string;
  contentHtml: string;
}): Promise<number> {
  const mentionIds = await activeMentionIds(contentHtml);
  return createNotifications(
    actor.id,
    mentionIds.map((userId) => ({
      userId,
      type: "mention",
      message: `${actor.name} mentioned you in a daily update`,
      link: `/#update-${updateId}`,
    }))
  );
}

/** Used by Module 9 when an assignment is created. */
export async function notifyAssignmentCreated({
  actor,
  assignmentId,
  assigneeIds,
  summary,
}: {
  actor: SessionUser;
  assignmentId: string;
  assigneeIds: string[];
  summary: string;
}): Promise<number> {
  const shortSummary =
    summary.length > 80 ? `${summary.slice(0, 77)}...` : summary;

  return createNotifications(
    actor.id,
    assigneeIds.map((userId) => ({
      userId,
      type: "assignment",
      message: `${actor.name} assigned you: ${shortSummary}`,
      link: `/assignments#assignment-${assignmentId}`,
    }))
  );
}

/** Used by Module 9 when an assignee changes status. */
export async function notifyAssignmentStatusChanged({
  actor,
  assignmentId,
  recipientIds,
  statusLabel,
}: {
  actor: SessionUser;
  assignmentId: string;
  recipientIds: string[];
  statusLabel: string;
}): Promise<number> {
  return createNotifications(
    actor.id,
    recipientIds.map((userId) => ({
      userId,
      type: "assignment_status",
      message: `${actor.name} marked an assignment as ${statusLabel}`,
      link: `/assignments#assignment-${assignmentId}`,
    }))
  );
}
