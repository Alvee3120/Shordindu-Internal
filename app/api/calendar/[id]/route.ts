import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import {
  formatFieldErrors,
  updateCalendarEventSchema,
} from "@/lib/validators";
import {
  calendarError,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/calendar";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = updateCalendarEventSchema.safeParse(
    await readJsonBody(request),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the entry.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await updateCalendarEvent(user, params.id, parsed.data);
  if (!result.ok) {
    const { status, message } = calendarError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    event: result.data,
    message: "Calendar entry updated.",
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const result = await deleteCalendarEvent(user, params.id);
  if (!result.ok) {
    const { status, message } = calendarError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: "Calendar entry deleted." });
}
