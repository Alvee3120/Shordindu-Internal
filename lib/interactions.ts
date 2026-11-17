import { TargetType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isSameDhakaDay } from "@/lib/time";
import { extractPlainText, sanitizeRichText } from "@/lib/sanitize";
import { replaceMentions } from "@/lib/mentions";
import { notifyCommentCreated } from "@/lib/notifications";
import { isReactionEmoji, REACTION_EMOJIS } from "@/lib/reaction-emojis";
import type { SessionUser } from "@/lib/auth";

export type CommentTargetType = "update" | "assignment";

export interface ReactionUser {
  id: string;
  name: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  users: ReactionUser[];
  reactedByMe: boolean;
}

export interface CommentView {
  id: string;
  author: {
    id: string;
    name: string;
    position: string;
    department: string;
  };
  contentHtml: string;
  createdAt: Date;
  editedAt: Date | null;
  canEdit: boolean;
  reactions: ReactionSummary[];
}

export type InteractionFailure =
  | "not_found"
  | "locked"
  | "empty_content"
  | "invalid_emoji";

export type InteractionResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: InteractionFailure };

export function interactionError(reason: InteractionFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "That item was not found." };
    case "locked":
      return {
        status: 409,
        message:
          "Comments can only be edited or deleted on the day they were written.",
      };
    case "empty_content":
      return { status: 400, message: "Write something before saving." };
    case "invalid_emoji":
      return { status: 400, message: "That reaction is not supported." };
  }
}

async function targetExists(
  targetType: TargetType,
  targetId: string,
): Promise<boolean> {
  switch (targetType) {
    case TargetType.update:
      return Boolean(
        await prisma.update.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        }),
      );
    case TargetType.assignment:
      return Boolean(
        await prisma.assignment.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        }),
      );
    case TargetType.comment:
      return Boolean(
        await prisma.comment.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        }),
      );
    default:
      return false;
  }
}

export async function commentCount(
  targetType: CommentTargetType,
  targetId: string,
): Promise<number> {
  return prisma.comment.count({
    where: { targetType, targetId, deletedAt: null },
  });
}

export async function getReactionSummary(
  targetType: TargetType,
  targetId: string,
  viewerId: string,
): Promise<ReactionSummary[]> {
  const rows = await prisma.reaction.findMany({
    where: { targetType, targetId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const grouped = new Map<string, ReactionUser[]>();
  for (const row of rows) {
    const users = grouped.get(row.emoji) ?? [];
    users.push(row.user);
    grouped.set(row.emoji, users);
  }

  return REACTION_EMOJIS.filter((emoji) => grouped.has(emoji)).map((emoji) => {
    const users = grouped.get(emoji)!;
    return {
      emoji,
      count: users.length,
      users,
      reactedByMe: users.some((user) => user.id === viewerId),
    };
  });
}

export async function toggleReaction(
  actor: SessionUser,
  targetType: TargetType,
  targetId: string,
  emoji: string,
): Promise<InteractionResult<ReactionSummary[]>> {
  if (!isReactionEmoji(emoji)) return { ok: false, reason: "invalid_emoji" };
  if (!(await targetExists(targetType, targetId))) {
    return { ok: false, reason: "not_found" };
  }

  const existing = await prisma.reaction.findUnique({
    where: {
      targetType_targetId_userId_emoji: {
        targetType,
        targetId,
        userId: actor.id,
        emoji,
      },
    },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({
      data: { targetType, targetId, userId: actor.id, emoji },
    });
  }

  return {
    ok: true,
    data: await getReactionSummary(targetType, targetId, actor.id),
  };
}

function groupReactions(
  rows: {
    targetId: string;
    emoji: string;
    user: ReactionUser;
  }[],
  viewerId: string,
): Map<string, ReactionSummary[]> {
  const byTarget = new Map<string, Map<string, ReactionUser[]>>();

  for (const row of rows) {
    const emojis = byTarget.get(row.targetId) ?? new Map<string, ReactionUser[]>();
    const users = emojis.get(row.emoji) ?? [];
    users.push(row.user);
    emojis.set(row.emoji, users);
    byTarget.set(row.targetId, emojis);
  }

  const result = new Map<string, ReactionSummary[]>();
  byTarget.forEach((emojis, targetId) => {
    const summaries = REACTION_EMOJIS.filter((emoji) => emojis.has(emoji)).map(
      (emoji) => {
        const users = emojis.get(emoji)!;
        return {
          emoji,
          count: users.length,
          users,
          reactedByMe: users.some((user) => user.id === viewerId),
        };
      },
    );
    result.set(targetId, summaries);
  });

  return result;
}

export async function listComments(
  viewerId: string,
  targetType: CommentTargetType,
  targetId: string,
): Promise<CommentView[]> {
  const comments = await prisma.comment.findMany({
    where: { targetType, targetId, deletedAt: null },
    include: {
      user: {
        select: { id: true, name: true, position: true, department: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const reactionRows = comments.length
    ? await prisma.reaction.findMany({
        where: {
          targetType: TargetType.comment,
          targetId: { in: comments.map((comment) => comment.id) },
        },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const reactionsByComment = groupReactions(
    reactionRows.map((row) => ({
      targetId: row.targetId,
      emoji: row.emoji,
      user: row.user,
    })),
    viewerId,
  );

  return comments.map((comment) => ({
    id: comment.id,
    author: comment.user,
    contentHtml: comment.contentHtml,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    canEdit:
      comment.userId === viewerId &&
      isSameDhakaDay(new Date(), comment.createdAt),
    reactions: reactionsByComment.get(comment.id) ?? [],
  }));
}

function prepareCommentContent(contentHtml: string): {
  html: string;
  text: string;
} {
  const html = sanitizeRichText(contentHtml);
  return { html, text: extractPlainText(html) };
}

export async function createComment(
  actor: SessionUser,
  targetType: CommentTargetType,
  targetId: string,
  contentHtml: string,
): Promise<InteractionResult<CommentView>> {
  if (!(await targetExists(targetType, targetId))) {
    return { ok: false, reason: "not_found" };
  }

  const { html, text } = prepareCommentContent(contentHtml);
  if (!text) return { ok: false, reason: "empty_content" };

  const createdAt = new Date();
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        targetType,
        targetId,
        userId: actor.id,
        contentHtml: html,
        createdAt,
      },
    });
    await replaceMentions(tx, TargetType.comment, created.id, html);
    await logAudit(
      {
        actorId: actor.id,
        action: "comment.created",
        targetType: "comment",
        targetId: created.id,
        afterJson: { targetType, targetId, contentHtml: html },
      },
      tx,
    );
    return created;
  });

  try {
    await notifyCommentCreated({
      actor,
      targetType,
      targetId,
      contentHtml: html,
    });
  } catch (error) {
    console.error("[notifications] Could not notify comment recipients", error);
  }

  return {
    ok: true,
    data: {
      id: comment.id,
      author: {
        id: actor.id,
        name: actor.name,
        position: actor.position,
        department: actor.department,
      },
      contentHtml: comment.contentHtml,
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
      canEdit: true,
      reactions: [],
    },
  };
}

export async function editComment(
  actor: SessionUser,
  commentId: string,
  contentHtml: string,
): Promise<InteractionResult<CommentView>> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      user: {
        select: { id: true, name: true, position: true, department: true },
      },
    },
  });

  if (!comment || comment.deletedAt || comment.userId !== actor.id) {
    return { ok: false, reason: "not_found" };
  }
  if (!isSameDhakaDay(new Date(), comment.createdAt)) {
    return { ok: false, reason: "locked" };
  }

  const { html, text } = prepareCommentContent(contentHtml);
  if (!text) return { ok: false, reason: "empty_content" };

  const editedAt = new Date();
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.comment.update({
      where: { id: comment.id },
      data: { contentHtml: html, editedAt },
    });
    await replaceMentions(tx, TargetType.comment, comment.id, html);
    await logAudit(
      {
        actorId: actor.id,
        action: "comment.edited",
        targetType: "comment",
        targetId: comment.id,
        beforeJson: { contentHtml: comment.contentHtml },
        afterJson: { contentHtml: html, editedAt: editedAt.toISOString() },
      },
      tx,
    );
    return updated;
  });

  return {
    ok: true,
    data: {
      id: saved.id,
      author: comment.user,
      contentHtml: saved.contentHtml,
      createdAt: saved.createdAt,
      editedAt: saved.editedAt,
      canEdit: true,
      reactions: await getReactionSummary(
        TargetType.comment,
        comment.id,
        actor.id,
      ),
    },
  };
}

export async function deleteComment(
  actor: SessionUser,
  commentId: string,
): Promise<InteractionResult<true>> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, createdAt: true, deletedAt: true },
  });

  if (!comment || comment.deletedAt || comment.userId !== actor.id) {
    return { ok: false, reason: "not_found" };
  }
  if (!isSameDhakaDay(new Date(), comment.createdAt)) {
    return { ok: false, reason: "locked" };
  }

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.comment.update({
      where: { id: comment.id },
      data: { deletedAt },
    });
    await tx.mention.deleteMany({
      where: { targetType: TargetType.comment, targetId: comment.id },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "comment.deleted",
        targetType: "comment",
        targetId: comment.id,
        beforeJson: { deletedAt: null },
        afterJson: { deletedAt: deletedAt.toISOString() },
      },
      tx,
    );
  });

  return { ok: true, data: true };
}
