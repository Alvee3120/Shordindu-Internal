import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import {
  assignmentListQuerySchema,
  createAssignmentSchema,
  formatFieldErrors,
} from "@/lib/validators";
import {
  assignmentError,
  createAssignment,
  listAssignments,
} from "@/lib/assignments";

export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const params = request.nextUrl.searchParams;
  const parsed = assignmentListQuerySchema.safeParse({
    view: params.get("view") || undefined,
    personId: params.get("personId") || undefined,
    department: params.get("department") || undefined,
    status: params.get("status") || undefined,
    dueFrom: params.get("dueFrom") || undefined,
    dueTo: params.get("dueTo") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid filters." },
      { status: 400 },
    );
  }

  const assignments = await listAssignments(user, parsed.data);
  return NextResponse.json({ assignments });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = createAssignmentSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the assignment.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await createAssignment(user, parsed.data);
  if (!result.ok) {
    const { status, message } = assignmentError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { assignment: result.data, message: "Assignment created." },
    { status: 201 },
  );
}
