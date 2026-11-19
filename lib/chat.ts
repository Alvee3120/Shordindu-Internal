import { TargetType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isSameDhakaDay } from "@/lib/time";
import { sanitizeCommentText } from "@/lib/sanitize";
import {
  extractMentionIdsFromText,
  replaceMentionTokens,
  toMentionTokensForActiveUsers,
} from "@/lib/mentions";
import { createNotifications } from "@/lib/notifications";
import type { SessionUser } from "@/lib/auth";

/**
 * Global chat.
 * One shared room: anyone signed in can read and post. Messages are plain text
 * with @mentions, the same format comments use. Messages are not emailed; the
 * mention notification and the in-app bell cover it.
 */

export type ChatFailure = "not_found" | "locked" | "empty_content";

export type ChatResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: ChatFailure };

export function chatError(reason: ChatFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "Message not found." };
    case "locked":
      return {
        status: 409,
        message:
          "Messages can only be edited or deleted on the day they were sent.",
      };
    case "empty_content":
      return { status: 400, message: "Write something before sending." };
  }
}

export interface ChatMessageView {
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
}

function toView(
  message: {
    id: string;
    userId: string;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
    user: {
      id: string;
      name: string;
      position: string;
      department: string;
      avatarFile: string | null;
    };
  },
  viewer: SessionUser,
): ChatMessageView {
  return {
    id: message.id,
    author: message.user,
    content: message.content,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    canEdit:
      message.userId === viewer.id &&
      isSameDhakaDay(new Date(), message.createdAt),
  };
}

const messageInclude = {
  user: {
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      avatarFile: true,
    },
  },
} as const;

/**
 * A change stamp strictly greater than every stored one.
 * The poller resumes from (updatedAt, id) and only asks for rows *after* it, so
 * two writes in the same millisecond would hide the second one. Bumping by a
 * millisecond guarantees every change advances the stream.
 */
export async function nextChangeStamp(): Promise<Date> {
  const latest = await prisma.chatMessage.findFirst({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { updatedAt: true },
  });
  const now = Date.now();
  return new Date(latest ? Math.max(now, latest.updatedAt.getTime() + 1) : now);
}

export interface ChatPage {
  messages: ChatMessageView[];
  /** Pass back as `before` to load older messages; null when the start is reached. */
  nextCursor: string | null;
  /** Where the live poller should start watching for edits and deletions. */
  syncCursor: ChatCursor | null;
}

/** A stable position in the change stream, ordered by (updatedAt, id). */
export interface ChatCursor {
  updatedAt: string;
  id: string;
}

/**
 * Newest-first page of messages. `before` is the id of the oldest message the
 * caller already has, so scrolling up pages backwards without duplicates.
 * Ordering breaks timestamp ties by id so paging never skips a message.
 */
export async function listMessages(
  viewer: SessionUser,
  options: { before?: string; limit?: number } = {},
): Promise<ChatPage> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  const rows = await prisma.chatMessage.findMany({
    where: { deletedAt: null },
    include: messageInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.before
      ? { cursor: { id: options.before }, skip: 1 }
      : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];

  return {
    // Oldest first, so the UI can append top-to-bottom.
    messages: page.reverse().map((message) => toView(message, viewer)),
    nextCursor: hasMore && oldest ? oldest.id : null,
    syncCursor: await maxCursor(),
  };
}

/**
 * The newest point in the change stream across every message, including ones
 * outside the page the client loaded. Starting the poller from here means an
 * edit to an older, not-yet-loaded message is not mistaken for a new one.
 */
async function maxCursor(): Promise<ChatCursor | null> {
  const row = await prisma.chatMessage.findFirst({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { updatedAt: true, id: true },
  });
  return row ? { updatedAt: row.updatedAt.toISOString(), id: row.id } : null;
}

export interface ChatDelta {
  /** Messages created or edited since the cursor, oldest change first. */
  messages: ChatMessageView[];
  /** Ids removed since the cursor, so the client can drop them. */
  deletedIds: string[];
  /** Resume point for the next poll. */
  syncCursor: ChatCursor;
}

/**
 * Everything that changed after the given cursor: new messages, edits and
 * deletions. Deleted rows are returned as tombstones (id only) because a soft
 * delete still moves `updatedAt`.
 */
export async function listChanges(
  viewer: SessionUser,
  since: Date,
  sinceId: string,
  limit = 100,
): Promise<ChatDelta> {
  const rows = await prisma.chatMessage.findMany({
    where: {
      OR: [
        { updatedAt: { gt: since } },
        { updatedAt: since, id: { gt: sinceId } },
      ],
    },
    include: messageInclude,
    // Same ordering the cursor uses, so no change is skipped or repeated.
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  const last = rows[rows.length - 1];
  const messages: ChatMessageView[] = [];
  const deletedIds: string[] = [];

  for (const row of rows) {
    if (row.deletedAt) deletedIds.push(row.id);
    else messages.push(toView(row, viewer));
  }

  return {
    messages,
    deletedIds,
    syncCursor: last
      ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
      : { updatedAt: since.toISOString(), id: sinceId },
  };
}

/**
 * The instant this user last read the room. A user who has never opened the
 * chat starts from when they were created, so only messages posted after they
 * joined count as unread.
 */
async function lastReadAt(userId: string): Promise<Date> {
  const row = await prisma.chatRead.findUnique({
    where: { userId },
    select: { lastReadAt: true },
  });
  if (row) return row.lastReadAt;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  return user?.createdAt ?? new Date();
}

/** Unread messages: not deleted, not written by the viewer, newer than their marker. */
export async function unreadCount(userId: string): Promise<number> {
  const since = await lastReadAt(userId);
  return prisma.chatMessage.count({
    where: {
      deletedAt: null,
      userId: { not: userId },
      createdAt: { gt: since },
    },
  });
}

/** Moves the viewer's read marker to now. */
export async function markChatRead(userId: string): Promise<void> {
  const now = new Date();
  await prisma.chatRead.upsert({
    where: { userId },
    update: { lastReadAt: now },
    create: { userId, lastReadAt: now },
  });
}

export async function createMessage(
  actor: SessionUser,
  rawContent: string,
): Promise<ChatResult<ChatMessageView>> {
  const raw = sanitizeCommentText(rawContent);
  if (!raw) return { ok: false, reason: "empty_content" };

  const changedAt = await nextChangeStamp();
  const { created, content, mentionIds } = await prisma.$transaction(
    async (tx) => {
      const content = await toMentionTokensForActiveUsers(tx, raw);
      const created = await tx.chatMessage.create({
        data: { userId: actor.id, content, updatedAt: changedAt },
        include: messageInclude,
      });
      await replaceMentionTokens(
        tx,
        TargetType.chatMessage,
        created.id,
        content,
      );
      await logAudit(
        {
          actorId: actor.id,
          action: "chat.message_sent",
          targetType: "chat",
          targetId: created.id,
          afterJson: { content },
        },
        tx,
      );

      return {
        created,
        content,
        mentionIds: extractMentionIdsFromText(content),
      };
    },
  );

  try {
    await createNotifications(
      actor.id,
      mentionIds.map((userId) => ({
        userId,
        type: "chat_mention",
        message: `${actor.name} mentioned you in the group chat`,
        link: `/chat#message-${created.id}`,
      })),
    );
  } catch (error) {
    console.error("[chat] Could not notify mentioned users", error);
  }

  return { ok: true, data: toView(created, actor) };
}

export async function editMessage(
  actor: SessionUser,
  messageId: string,
  rawContent: string,
): Promise<ChatResult<ChatMessageView>> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: messageInclude,
  });
  if (!message || message.deletedAt) return { ok: false, reason: "not_found" };
  if (message.userId !== actor.id) return { ok: false, reason: "not_found" };
  if (!isSameDhakaDay(new Date(), message.createdAt)) {
    return { ok: false, reason: "locked" };
  }

  const raw = sanitizeCommentText(rawContent);
  if (!raw) return { ok: false, reason: "empty_content" };

  const changedAt = await nextChangeStamp();
  const editedAt = new Date();
  const saved = await prisma.$transaction(async (tx) => {
    const content = await toMentionTokensForActiveUsers(tx, raw);
    const updated = await tx.chatMessage.update({
      where: { id: messageId },
      data: { content, editedAt, updatedAt: changedAt },
      include: messageInclude,
    });
    await replaceMentionTokens(tx, TargetType.chatMessage, messageId, content);
    await logAudit(
      {
        actorId: actor.id,
        action: "chat.message_edited",
        targetType: "chat",
        targetId: messageId,
        beforeJson: { content: message.content },
        afterJson: { content },
      },
      tx,
    );
    return updated;
  });

  return { ok: true, data: toView(saved, actor) };
}

export async function deleteMessage(
  actor: SessionUser,
  messageId: string,
): Promise<ChatResult<{ id: string }>> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
  });
  if (!message || message.deletedAt) return { ok: false, reason: "not_found" };
  if (message.userId !== actor.id) return { ok: false, reason: "not_found" };
  if (!isSameDhakaDay(new Date(), message.createdAt)) {
    return { ok: false, reason: "locked" };
  }

  const changedAt = await nextChangeStamp();
  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt, updatedAt: changedAt },
    });
    await tx.mention.deleteMany({
      where: { targetType: TargetType.chatMessage, targetId: messageId },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "chat.message_deleted",
        targetType: "chat",
        targetId: messageId,
        beforeJson: { content: message.content },
      },
      tx,
    );
  });

  return { ok: true, data: { id: messageId } };
}
