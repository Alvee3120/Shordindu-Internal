import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { leaveDecisionSchema } from "@/lib/validators";
import { decideLeave, leaveError } from "@/lib/leaves";

/** Approve or reject a pending leave request. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = leaveDecisionSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose approve or reject." },
      { status: 400 },
    );
  }

  const result = await decideLeave(user, params.id, parsed.data.decision);
  if (!result.ok) {
    const { status, message } = leaveError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    leave: result.leave,
    message:
      parsed.data.decision === "approve"
        ? "Leave approved."
        : "Leave rejected.",
  });
}
