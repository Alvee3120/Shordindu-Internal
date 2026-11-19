import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { formatFieldErrors, leaveSchema } from "@/lib/validators";
import { canApproveLeave, canMarkLeaveForOthers } from "@/lib/permissions";
import { applyForLeave, leaveError, listLeaves } from "@/lib/leaves";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const leaves = await listLeaves(user);
  return NextResponse.json({
    leaves,
    canMarkForOthers: canMarkLeaveForOthers(user.role),
    canApprove: canApproveLeave(user.role),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = leaveSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the request.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await applyForLeave(user, parsed.data);
  if (!result.ok) {
    const { status, message } = leaveError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    {
      leave: result.leave,
      message:
        result.leave.status === "Approved"
          ? "Leave marked and approved."
          : "Leave request sent for approval.",
    },
    { status: 201 },
  );
}
