import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { appUrl, sendEmail, type EmailPayload } from "@/lib/email";

interface PendingNotification {
  id: string;
  userId: string;
  type: string;
  message: string;
  link: string;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    status: UserStatus;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDigestEmail(
  user: { name: string; email: string },
  notifications: { message: string; link: string }[],
): EmailPayload | null {
  if (notifications.length === 0) return null;

  const base = appUrl();
  const count = notifications.length;
  const subject = `You have ${count} new notification${count === 1 ? "" : "s"} - Shordindu Internal`;

  const text = [
    `Hi ${user.name},`,
    "",
    ...notifications.map((notification) => `- ${notification.message}: ${base}${notification.link}`),
    "",
    `Open Shordindu Internal: ${base}`,
  ].join("\n");

  const items = notifications
    .map(
      (notification) =>
        `<li><a href="${base}${notification.link}">${escapeHtml(
          notification.message,
        )}</a></li>`,
    )
    .join("");

  return {
    to: user.email,
    subject,
    text,
    html: `<p>Hi ${escapeHtml(user.name)},</p><ul>${items}</ul><p><a href="${base}">Open Shordindu Internal</a></p>`,
  };
}

/**
 * Groups all pending notifications per user into one digest email and marks
 * them as emailed. Users who are no longer Active are marked without sending.
 */
export async function processPendingDigests(
  send: (payload: EmailPayload) => Promise<unknown> = sendEmail,
  options: { userIds?: string[] } = {},
): Promise<{ emails: number; notifications: number }> {
  const pending = await prisma.notification.findMany({
    where: {
      emailedAt: null,
      ...(options.userIds ? { userId: { in: options.userIds } } : {}),
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, status: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) {
    return { emails: 0, notifications: 0 };
  }

  const groups = new Map<string, PendingNotification[]>();
  for (const notification of pending) {
    const rows = groups.get(notification.userId) ?? [];
    rows.push(notification as PendingNotification);
    groups.set(notification.userId, rows);
  }

  const now = new Date();
  let emails = 0;

  const entries = Array.from(groups.values());
  for (const rows of entries) {
    const user = rows[0]!.user;

    if (user.status === UserStatus.Active && user.email) {
      const payload = buildDigestEmail(
        { name: user.name, email: user.email },
        rows.map((row) => ({ message: row.message, link: row.link })),
      );
      if (payload) {
        await send(payload);
        emails++;
      }
    }

    await prisma.notification.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { emailedAt: now },
    });
  }

  return { emails, notifications: pending.length };
}
