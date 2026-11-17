import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { leaveSchema } from "@/lib/validators";
import { canMarkLeaveForOthers } from "@/lib/permissions";
import { leaveError, listLeaves, markLeave } from "@/lib/leaves";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const leaves = await listLeaves(user);
  return NextResponse.json({
    leaves,
    canMarkForOthers: canMarkLeaveForOthers(user.role),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = leaveSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the dates." },
      { status: 400 },
    );
  }

  const result = await markLeave(user, parsed.data);
  if (!result.ok) {
    const { status, message } = leaveError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { leave: result.leave, message: "Leave marked." },
    { status: 201 },
  );
}
