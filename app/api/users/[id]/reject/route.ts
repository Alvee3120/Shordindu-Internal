import { NextResponse } from "next/server";
import { isApiResponse, requireApproverApi } from "@/lib/api";
import { rejectUser, userManagementError } from "@/lib/user-management";
import { queueRejectionEmail } from "@/lib/mailer";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const actor = await requireApproverApi();
  if (isApiResponse(actor)) return actor;

  const result = await rejectUser(actor, params.id);
  if (!result.ok) {
    const { status, message } = userManagementError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  await queueRejectionEmail({ to: result.data.email, name: result.data.name });

  return NextResponse.json({
    user: result.data,
    message: "Request rejected. An email has been sent.",
  });
}
