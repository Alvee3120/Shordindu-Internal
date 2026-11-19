import { NextResponse } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { markChatRead, unreadCount } from "@/lib/chat";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  return NextResponse.json({ unreadCount: await unreadCount(user.id) });
}

/** Marks the room as read up to now. Called when the user opens the chat. */
export async function POST() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  await markChatRead(user.id);
  return NextResponse.json({ unreadCount: 0 });
}
