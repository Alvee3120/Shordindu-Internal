import { NextResponse } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { assignmentError, cancelAssignment } from "@/lib/assignments";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const result = await cancelAssignment(user, params.id);
  if (!result.ok) {
    const { status, message } = assignmentError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    assignment: result.data,
    message: "Assignment cancelled.",
  });
}
