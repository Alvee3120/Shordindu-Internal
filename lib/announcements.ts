import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canPostAnnouncement } from "@/lib/permissions";
import { extractPlainText, sanitizeRichText } from "@/lib/sanitize";
import { isSameDhakaDay } from "@/lib/time";
import { appUrl, type EmailPayload } from "@/lib/email";
import { enqueueEmail } from "@/lib/queue";
import type { SessionUser } from "@/lib/auth";

/**
 * Announcements.
 * Any approver (Admin, HR, Manager) can post, edit or remove a notice.
 * Everyone reads them; every Active user gets one email through the queue.
 */

export type AnnouncementFailure =
  | "not_found"
  | "forbidden"
  | "empty_content"
  | "locked"
  | "no_changes";

export type AnnouncementResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AnnouncementFailure };

export type AnnouncementSender = (payload: EmailPayload) => Promise<unknown>;

export function announcementError(reason: AnnouncementFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "Announcement not found." };
    case "forbidden":
      return {
        status: 403,
        message: "Only Admin, HR and Manager can post announcements.",
      };
    case "empty_content":
      return { status: 400, message: "Write the announcement before saving." };
    case "locked":
      return {
        status: 403,
        message:
          "This announcement is locked. Announcements can only be changed on the day they were posted.",
      };
    case "no_changes":
      return { status: 400, message: "Nothing to update." };
  }
}

export interface AnnouncementView {
  id: string;
  title: string;
  contentHtml: string;
  createdAt: Date;
  editedAt: Date | null;
  author: {
    id: string;
    name: string;
    position: string;
    department: string;
  };
  canEdit: boolean;
}

const announcementInclude = {
  createdBy: {
    select: { id: true, name: true, position: true, department: true },
  },
} as const;

type AnnouncementWithAuthor = {
  id: string;
  title: string;
  contentHtml: string;
  contentText: string;
  createdAt: Date;
  editedAt: Date | null;
  createdBy: {
    id: string;
    name: string;
    position: string;
    department: string;
  };
};

function toView(
  announcement: AnnouncementWithAuthor,
  viewer: SessionUser,
): AnnouncementView {
  return {
    id: announcement.id,
    title: announcement.title,
    contentHtml: announcement.contentHtml,
    createdAt: announcement.createdAt,
    editedAt: announcement.editedAt,
    author: announcement.createdBy,
    canEdit:
      canPostAnnouncement(viewer.role) &&
      isSameDhakaDay(new Date(), announcement.createdAt),
  };
}

function prepareContent(rawHtml: string): { html: string; text: string } {
  const html = sanitizeRichText(rawHtml);
  return { html, text: extractPlainText(html) };
}

/**
 * Queues one announcement email per recipient and records an in-app
 * notification already marked as emailed, so the digest job does not send a
 * second copy.
 */
async function notifyAnnouncement({
  actor,
  announcement,
  send,
}: {
  actor: SessionUser;
  announcement: AnnouncementWithAuthor;
  send: AnnouncementSender;
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: { status: UserStatus.Active, id: { not: actor.id } },
    select: { id: true, name: true, email: true },
  });
  if (users.length === 0) return;

  const link = `/announcements#announcement-${announcement.id}`;
  const message = `${actor.name} posted an announcement: ${announcement.title}`;
  const now = new Date();

  await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: "announcement",
      message,
      link,
      emailedAt: now,
    })),
  });

  for (const user of users) {
    await send(
      buildAnnouncementEmail({
        to: user.email,
        name: user.name,
        author: actor.name,
        title: announcement.title,
        summary: announcement.contentText,
        link: `${appUrl()}${link}`,
      }),
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAnnouncementEmail({
  to,
  name,
  author,
  title,
  summary,
  link,
}: {
  to: string;
  name: string;
  author: string;
  title: string;
  summary: string;
  link: string;
}): EmailPayload {
  const shortSummary =
    summary.length > 300 ? `${summary.slice(0, 297)}...` : summary;
  return {
    to,
    subject: `New announcement: ${title} - Shordindu Internal`,
    text: [
      `Hi ${name},`,
      "",
      `${author} posted an announcement: ${title}`,
      "",
      shortSummary,
      "",
      `Read it: ${link}`,
    ].join("\n"),
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      `<p><strong>${escapeHtml(author)}</strong> posted an announcement:</p>`,
      `<p style="font-size:18px;font-weight:bold">${escapeHtml(title)}</p>`,
      `<p>${escapeHtml(shortSummary)}</p>`,
      `<p><a href="${link}">Read the announcement</a></p>`,
    ].join(""),
  };
}

export async function listAnnouncements(
  viewer: SessionUser,
): Promise<AnnouncementView[]> {
  const announcements = await prisma.announcement.findMany({
    where: { deletedAt: null },
    include: announcementInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return announcements.map((announcement) => toView(announcement, viewer));
}

export async function getAnnouncement(
  viewer: SessionUser,
  announcementId: string,
): Promise<AnnouncementView | null> {
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: announcementInclude,
  });
  if (!announcement || announcement.deletedAt) return null;
  return toView(announcement, viewer);
}

export async function createAnnouncement(
  actor: SessionUser,
  input: { title: string; contentHtml: string },
  send: AnnouncementSender = enqueueEmail,
): Promise<AnnouncementResult<AnnouncementView>> {
  if (!canPostAnnouncement(actor.role)) return { ok: false, reason: "forbidden" };

  const { html, text } = prepareContent(input.contentHtml);
  if (!text) return { ok: false, reason: "empty_content" };

  const created = await prisma.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        createdById: actor.id,
        title: input.title,
        contentHtml: html,
        contentText: text,
      },
      include: announcementInclude,
    });

    await logAudit(
      {
        actorId: actor.id,
        action: "announcement.created",
        targetType: "announcement",
        targetId: announcement.id,
        afterJson: { title: input.title, contentHtml: html },
      },
      tx,
    );

    return announcement;
  });

  try {
    await notifyAnnouncement({ actor, announcement: created, send });
  } catch (error) {
    console.error("[announcements] Could not notify users", error);
  }

  return { ok: true, data: toView(created, actor) };
}

async function findAnnouncement(
  announcementId: string,
): Promise<AnnouncementWithAuthor | null> {
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: announcementInclude,
  });
  if (!announcement || announcement.deletedAt) return null;
  return announcement;
}

export async function updateAnnouncement(
  actor: SessionUser,
  announcementId: string,
  input: { title?: string; contentHtml?: string },
): Promise<AnnouncementResult<AnnouncementView>> {
  if (!canPostAnnouncement(actor.role)) return { ok: false, reason: "forbidden" };

  const announcement = await findAnnouncement(announcementId);
  if (!announcement) return { ok: false, reason: "not_found" };
  if (!isSameDhakaDay(new Date(), announcement.createdAt)) {
    return { ok: false, reason: "locked" };
  }

  const data: { title?: string; contentHtml?: string; contentText?: string } = {};
  if (input.title !== undefined) data.title = input.title;

  if (input.contentHtml !== undefined) {
    const { html, text } = prepareContent(input.contentHtml);
    if (!text) return { ok: false, reason: "empty_content" };
    data.contentHtml = html;
    data.contentText = text;
  }

  if (Object.keys(data).length === 0) return { ok: false, reason: "no_changes" };

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.announcement.update({
      where: { id: announcementId },
      data: { ...data, editedAt: new Date() },
      include: announcementInclude,
    });

    await logAudit(
      {
        actorId: actor.id,
        action: "announcement.edited",
        targetType: "announcement",
        targetId: announcementId,
        beforeJson: {
          title: announcement.title,
          contentHtml: announcement.contentHtml,
        },
        afterJson: {
          title: saved.title,
          contentHtml: saved.contentHtml,
        },
      },
      tx,
    );

    return saved;
  });

  return { ok: true, data: toView(updated, actor) };
}

export async function deleteAnnouncement(
  actor: SessionUser,
  announcementId: string,
): Promise<AnnouncementResult<{ id: string }>> {
  if (!canPostAnnouncement(actor.role)) return { ok: false, reason: "forbidden" };

  const announcement = await findAnnouncement(announcementId);
  if (!announcement) return { ok: false, reason: "not_found" };
  if (!isSameDhakaDay(new Date(), announcement.createdAt)) {
    return { ok: false, reason: "locked" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({
      where: { id: announcementId },
      data: { deletedAt: new Date() },
    });

    await logAudit(
      {
        actorId: actor.id,
        action: "announcement.deleted",
        targetType: "announcement",
        targetId: announcementId,
        beforeJson: {
          title: announcement.title,
          contentHtml: announcement.contentHtml,
        },
      },
      tx,
    );
  });

  return { ok: true, data: { id: announcementId } };
}
