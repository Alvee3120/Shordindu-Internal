import { Prisma, type Update, TargetType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { dhakaToday, isSameDhakaDay } from "@/lib/time";
import { extractPlainText, sanitizeRichText } from "@/lib/sanitize";
import { replaceMentions } from "@/lib/mentions";
import { notifyUpdateMentions } from "@/lib/notifications";
import type { SessionUser } from "@/lib/auth";

export type UpdateFailure =
  | "not_found"
  | "locked"
  | "duplicate"
  | "future_date"
  | "empty_content";

export type UpdateResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: UpdateFailure };

export interface UpdateView {
  id: string;
  updateDate: Date;
  postedAt: Date;
  isLate: boolean;
  editedAt: Date | null;
  contentHtml: string;
  canEdit: boolean;
}

export function updateError(reason: UpdateFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "Update not found." };
    case "locked":
      return {
        status: 409,
        message:
          "This update is locked. Updates can only be edited or deleted on the day they were posted.",
      };
    case "duplicate":
      return {
        status: 409,
        message: "You already have an update for that date.",
      };
    case "future_date":
      return { status: 400, message: "Choose today or an earlier date." };
    case "empty_content":
      return { status: 400, message: "Write something before saving." };
  }
}

/** Date-only value for Prisma `@db.Date` columns (UTC midnight). */
export function parseUpdateDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function dateStringOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toView(update: Update): UpdateView {
  return {
    id: update.id,
    updateDate: update.updateDate,
    postedAt: update.postedAt,
    isLate: update.isLate,
    editedAt: update.editedAt,
    contentHtml: update.contentHtml,
    canEdit: isSameDhakaDay(new Date(), update.postedAt),
  };
}

function prepareContent(contentHtml: string): {
  html: string;
  text: string;
} {
  const html = sanitizeRichText(contentHtml);
  return { html, text: extractPlainText(html) };
}

/** The signed-in user's own update for a date, if it exists and is not deleted. */
export async function getMyUpdateForDate(
  userId: string,
  dateString: string,
): Promise<UpdateView | null> {
  const update = await prisma.update.findUnique({
    where: {
      userId_updateDate: {
        userId,
        updateDate: parseUpdateDate(dateString),
      },
    },
  });

  if (!update || update.deletedAt) return null;
  return toView(update);
}

/** Recent non-deleted updates written by the user, newest update date first. */
export async function listMyUpdates(userId: string): Promise<UpdateView[]> {
  const updates = await prisma.update.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ updateDate: "desc" }, { postedAt: "desc" }],
    take: 60,
  });
  return updates.map(toView);
}

export async function createUpdate(
  actor: SessionUser,
  input: { updateDate: string; contentHtml: string },
): Promise<UpdateResult<UpdateView>> {
  const today = dhakaToday();
  if (input.updateDate > today) return { ok: false, reason: "future_date" };

  const { html, text } = prepareContent(input.contentHtml);
  if (!text) return { ok: false, reason: "empty_content" };

  const updateDate = parseUpdateDate(input.updateDate);
  const isLate = input.updateDate < today;
  const postedAt = new Date();

  const existing = await prisma.update.findUnique({
    where: {
      userId_updateDate: { userId: actor.id, updateDate },
    },
  });
  if (existing) return { ok: false, reason: "duplicate" };

  let created: Update;
  try {
    created = await prisma.$transaction(async (tx) => {
      const update = await tx.update.create({
        data: {
          userId: actor.id,
          contentHtml: html,
          contentText: text,
          updateDate,
          postedAt,
          isLate,
        },
      });
      await replaceMentions(tx, TargetType.update, update.id, html);
      await logAudit(
        {
          actorId: actor.id,
          action: "update.created",
          targetType: "update",
          targetId: update.id,
          afterJson: {
            updateDate: dateStringOf(updateDate),
            isLate,
            contentHtml: html,
          },
        },
        tx,
      );
      return update;
    });
  } catch (error) {
    // Two submits for the same day can pass the lookup together; the unique
    // (user, date) constraint settles it, so report the second as a duplicate.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, reason: "duplicate" };
    }
    throw error;
  }

  try {
    await notifyUpdateMentions({
      actor,
      updateId: created.id,
      contentHtml: html,
    });
  } catch (error) {
    console.error("[notifications] Could not notify mentioned users", error);
  }

  return { ok: true, data: toView(created) };
}

async function findOwnUpdate(
  actor: SessionUser,
  updateId: string,
): Promise<Update | null> {
  const update = await prisma.update.findUnique({ where: { id: updateId } });
  if (!update || update.deletedAt) return null;
  if (update.userId !== actor.id) return null;
  return update;
}

export async function editUpdate(
  actor: SessionUser,
  updateId: string,
  input: { contentHtml: string },
): Promise<UpdateResult<UpdateView>> {
  const update = await findOwnUpdate(actor, updateId);
  if (!update) return { ok: false, reason: "not_found" };
  if (!isSameDhakaDay(new Date(), update.postedAt)) {
    return { ok: false, reason: "locked" };
  }

  const { html, text } = prepareContent(input.contentHtml);
  if (!text) return { ok: false, reason: "empty_content" };

  const editedAt = new Date();
  const edited = await prisma.$transaction(async (tx) => {
    const saved = await tx.update.update({
      where: { id: update.id },
      data: { contentHtml: html, contentText: text, editedAt },
    });
    await replaceMentions(tx, TargetType.update, update.id, html);
    await logAudit(
      {
        actorId: actor.id,
        action: "update.edited",
        targetType: "update",
        targetId: update.id,
        beforeJson: { contentHtml: update.contentHtml },
        afterJson: { contentHtml: html, editedAt: editedAt.toISOString() },
      },
      tx,
    );
    return saved;
  });

  return { ok: true, data: toView(edited) };
}

export async function deleteUpdate(
  actor: SessionUser,
  updateId: string,
): Promise<UpdateResult<UpdateView>> {
  const update = await findOwnUpdate(actor, updateId);
  if (!update) return { ok: false, reason: "not_found" };
  if (!isSameDhakaDay(new Date(), update.postedAt)) {
    return { ok: false, reason: "locked" };
  }

  const deletedAt = new Date();
  const deleted = await prisma.$transaction(async (tx) => {
    const saved = await tx.update.update({
      where: { id: update.id },
      data: { deletedAt },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "update.deleted",
        targetType: "update",
        targetId: update.id,
        beforeJson: { contentHtml: update.contentHtml, deletedAt: null },
        afterJson: { deletedAt: deletedAt.toISOString() },
      },
      tx,
    );
    return saved;
  });

  return { ok: true, data: toView(deleted) };
}
