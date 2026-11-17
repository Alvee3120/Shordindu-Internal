import { NextResponse } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { listMyUpdates } from "@/lib/updates";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const updates = await listMyUpdates(user.id);
  return NextResponse.json({ updates });
}
