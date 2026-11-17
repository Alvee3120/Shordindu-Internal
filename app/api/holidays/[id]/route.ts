import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { updateHolidaySchema } from "@/lib/validators";
import {
  deleteHoliday,
  holidayError,
  updateHoliday,
} from "@/lib/holidays";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = updateHolidaySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the holiday." },
      { status: 400 },
    );
  }

  const result = await updateHoliday(user, params.id, parsed.data);
  if (!result.ok) {
    const { status, message } = holidayError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    holiday: result.holiday,
    message: "Holiday updated.",
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const result = await deleteHoliday(user, params.id);
  if (!result.ok) {
    const { status, message } = holidayError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: "Holiday deleted." });
}
