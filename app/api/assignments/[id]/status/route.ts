import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { updateAssigneeStatusSchema } from "@/lib/validators";
import {
  assignmentError,
  updateAssigneeStatus,
} from "@/lib/assignments";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = updateAssigneeStatusSchema.safeParse(
    await readJsonBody(request),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a status." },
      { status: 400 },
    );
  }

  const result = await updateAssigneeStatus(user, params.id, parsed.data);
  if (!result.ok) {
    const { status, message } = assignmentError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    assignment: result.data,
    message: "Status updated.",
  });
}
