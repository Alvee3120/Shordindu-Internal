import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireApproverApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { formatFieldErrors, updateUserSchema } from "@/lib/validators";
import { updateUser, userManagementError } from "@/lib/user-management";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const actor = await requireApproverApi();
  if (isApiResponse(actor)) return actor;

  const parsed = updateUserSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the form and try again.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await updateUser(actor, params.id, parsed.data);
  if (!result.ok) {
    const { status, message } = userManagementError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ user: result.data, message: "User updated." });
}
