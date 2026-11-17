import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        message: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

/** Marks one notification (body.id) or all notifications as read. */
export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const body = (await readJsonBody(request)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : undefined;

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      ...(id ? { id } : {}),
    },
    data: { readAt: new Date() },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  return NextResponse.json({ unreadCount });
}
