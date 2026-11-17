import { NextResponse } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { listActivePeople } from "@/lib/feed";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const people = await listActivePeople();
  return NextResponse.json({ people });
}
