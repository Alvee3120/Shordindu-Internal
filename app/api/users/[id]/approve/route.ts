import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireApproverApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { approveUserSchema, formatFieldErrors } from "@/lib/validators";
import { approveUser, userManagementError } from "@/lib/user-management";
import { queueApprovalEmail } from "@/lib/mailer";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const actor = await requireApproverApi();
  if (isApiResponse(actor)) return actor;

  const parsed = approveUserSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Choose a role, department and position.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await approveUser(actor, params.id, parsed.data);
  if (!result.ok) {
    const { status, message } = userManagementError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  await queueApprovalEmail({
    to: result.data.email,
    name: result.data.name,
    role: parsed.data.role,
  });

  return NextResponse.json({
    user: result.data,
    message: "User approved. An email has been sent.",
  });
}
