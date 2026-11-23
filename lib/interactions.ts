import { ReactionKind, TargetType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isSameDhakaDay } from "@/lib/time";
import { sanitizeCommentText } from "@/lib/sanitize";
import {
  replaceMentionTokens,
  toMentionTokensForActiveUsers,
} from "@/lib/mentions";
import { notifyCommentCreated } from "@/lib/notifications";
import { isReactionKind, REACTION_KINDS } from "@/lib/reactions";
import type { SessionUser } from "@/lib/auth";

export type CommentTargetType = "update" | "assignment";

export interface ReactionUser {
  id: string;
  name: string;
}

export interface ReactionSummary {
  kind: ReactionKind;
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
    avatarFile: string | null;
  };
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  canEdit: boolean;
  reactions: ReactionSummary[];
}

export type InteractionFailure =
  "not_found" | "locked" | "empty_content" | "invalid_reaction";

export type InteractionResult<T> =
  { ok: true; data: T } | { ok: false; reason: InteractionFailure };

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
    case "invalid_reaction":
      return { status: 400, message: "That reaction is not supported." };
  }
}

async function targetExists(
  targetType: TargetType,
  targetId: string
): Promise<boolean> {
  switch (targetType) {
    case TargetType.update:
      return Boolean(
        await prisma.update.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        })
      );
    case TargetType.assignment:
      return Boolean(
        await prisma.assignment.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        })
      );
    case TargetType.comment:
      return Boolean(
        await prisma.comment.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        })
      );
    default:
      return false;
  }
}

export async function commentCount(
  targetType: CommentTargetType,
  targetId: string
): Promise<number> {
  return prisma.comment.count({
    where: { targetType, targetId, deletedAt: null },
  });
}

export async function getReactionSummary(
  targetType: TargetType,
  targetId: string,
  viewerId: string
): Promise<ReactionSummary[]> {
  const rows = await prisma.reaction.findMany({
    where: { targetType, targetId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const grouped = new Map<ReactionKind, ReactionUser[]>();
  for (const row of rows) {
    const users = grouped.get(row.kind) ?? [];
    users.push(row.user);
    grouped.set(row.kind, users);
  }

  return REACTION_KINDS.filter((kind) => grouped.has(kind)).map((kind) => {
    const users = grouped.get(kind)!;
    return {
      kind,
      count: users.length,
      users,
      reactedByMe: users.some((user) => user.id === viewerId),
    };
  });
}

/**
 * Sets the viewer's reaction to `kind`. Choosing the reaction they already
 * have removes it, and choosing the other one replaces it, so a person never
 * holds a like and a dislike on the same target.
 */
export async function toggleReaction(
  actor: SessionUser,
  targetType: TargetType,
  targetId: string,
  kind: string
): Promise<InteractionResult<ReactionSummary[]>> {
  if (!isReactionKind(kind)) return { ok: false, reason: "invalid_reaction" };
  if (!(await targetExists(targetType, targetId))) {
    return { ok: false, reason: "not_found" };
  }

  // Delete-then-upsert keeps a double-click race from hitting the unique
  // constraint: two wins on the same row become one create and one update.
  const removed = await prisma.reaction.deleteMany({
    where: { targetType, targetId, userId: actor.id, kind },
  });

  if (removed.count === 0) {
    await prisma.reaction.upsert({
      where: {
        targetType_targetId_userId: {
          targetType,
          targetId,
          userId: actor.id,
        },
      },
      update: { kind },
      create: { targetType, targetId, userId: actor.id, kind },
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
    kind: ReactionKind;
    user: ReactionUser;
  }[],
  viewerId: string
): Map<string, ReactionSummary[]> {
  const byTarget = new Map<string, Map<ReactionKind, ReactionUser[]>>();

  for (const row of rows) {
    const kinds =
      byTarget.get(row.targetId) ?? new Map<ReactionKind, ReactionUser[]>();
    const users = kinds.get(row.kind) ?? [];
    users.push(row.user);
    kinds.set(row.kind, users);
    byTarget.set(row.targetId, kinds);
  }

  const result = new Map<string, ReactionSummary[]>();
  byTarget.forEach((kinds, targetId) => {
    const summaries = REACTION_KINDS.filter((kind) => kinds.has(kind)).map(
      (kind) => {
        const users = kinds.get(kind)!;
        return {
          kind,
          count: users.length,
          users,
          reactedByMe: users.some((user) => user.id === viewerId),
        };
      }
    );
    result.set(targetId, summaries);
  });

  return result;
}

export async function listComments(
  viewerId: string,
  targetType: CommentTargetType,
  targetId: string
): Promise<CommentView[]> {
  const comments = await prisma.comment.findMany({
    where: { targetType, targetId, deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          position: true,
          department: true,
          avatarFile: true,
        },
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
      kind: row.kind,
      user: row.user,
    })),
    viewerId
  );

  return comments.map((comment) => ({
    id: comment.id,
    author: comment.user,
    content: comment.content,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    canEdit:
      comment.userId === viewerId &&
      isSameDhakaDay(new Date(), comment.createdAt),
    reactions: reactionsByComment.get(comment.id) ?? [],
  }));
}

export async function createComment(
  actor: SessionUser,
  targetType: CommentTargetType,
  targetId: string,
  rawContent: string
): Promise<InteractionResult<CommentView>> {
  if (!(await targetExists(targetType, targetId))) {
    return { ok: false, reason: "not_found" };
  }

  const raw = sanitizeCommentText(rawContent);
  if (!raw) return { ok: false, reason: "empty_content" };

  const createdAt = new Date();
  const { created: comment, content } = await prisma.$transaction(
    async (tx) => {
      const content = await toMentionTokensForActiveUsers(tx, raw);
      const created = await tx.comment.create({
        data: { targetType, targetId, userId: actor.id, content, createdAt },
      });
      await replaceMentionTokens(tx, TargetType.comment, created.id, content);
      await logAudit(
        {
          actorId: actor.id,
          action: "comment.created",
          targetType: "comment",
          targetId: created.id,
          afterJson: { targetType, targetId, content },
        },
        tx
      );
      return { created, content };
    }
  );

  try {
    await notifyCommentCreated({
      actor,
      targetType,
      targetId,
      content,
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
        avatarFile: actor.avatarFile,
      },
      content: comment.content,
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
  rawContent: string
): Promise<InteractionResult<CommentView>> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          position: true,
          department: true,
          avatarFile: true,
        },
      },
    },
  });

  if (!comment || comment.deletedAt || comment.userId !== actor.id) {
    return { ok: false, reason: "not_found" };
  }
  if (!isSameDhakaDay(new Date(), comment.createdAt)) {
    return { ok: false, reason: "locked" };
  }

  const raw = sanitizeCommentText(rawContent);
  if (!raw) return { ok: false, reason: "empty_content" };

  const editedAt = new Date();
  const saved = await prisma.$transaction(async (tx) => {
    const content = await toMentionTokensForActiveUsers(tx, raw);
    const updated = await tx.comment.update({
      where: { id: comment.id },
      data: { content, editedAt },
    });
    await replaceMentionTokens(tx, TargetType.comment, comment.id, content);
    await logAudit(
      {
        actorId: actor.id,
        action: "comment.edited",
        targetType: "comment",
        targetId: comment.id,
        beforeJson: { content: comment.content },
        afterJson: { content, editedAt: editedAt.toISOString() },
      },
      tx
    );
    return updated;
  });

  return {
    ok: true,
    data: {
      id: saved.id,
      author: comment.user,
      content: saved.content,
      createdAt: saved.createdAt,
      editedAt: saved.editedAt,
      canEdit: true,
      reactions: await getReactionSummary(
        TargetType.comment,
        comment.id,
        actor.id
      ),
    },
  };
}

export async function deleteComment(
  actor: SessionUser,
  commentId: string
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
      tx
    );
  });

  return { ok: true, data: true };
}
