import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { editUpdateSchema, formatFieldErrors } from "@/lib/validators";
import { deleteUpdate, editUpdate, updateError } from "@/lib/updates";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = editUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the form.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await editUpdate(user, params.id, parsed.data);
  if (!result.ok) {
    const { status, message } = updateError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    update: result.data,
    message: "Update edited.",
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const result = await deleteUpdate(user, params.id);
  if (!result.ok) {
    const { status, message } = updateError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: "Update deleted." });
}
