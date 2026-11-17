import { NextResponse } from "next/server";
import { isApiResponse, requireApproverApi } from "@/lib/api";
import { listPendingUsers } from "@/lib/user-management";

export async function GET() {
  const actor = await requireApproverApi();
  if (isApiResponse(actor)) return actor;

  const users = await listPendingUsers();
  return NextResponse.json({ users });
}
