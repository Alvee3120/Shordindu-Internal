import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { calendarError, setCalendarEventDone } from "@/lib/calendar";

/** Marks a calendar entry done or reopened. The record is kept either way. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const body = (await readJsonBody(request)) as { done?: unknown } | null;
  if (typeof body?.done !== "boolean") {
    return NextResponse.json(
      { error: "Send done: true or false." },
      { status: 400 },
    );
  }

  const result = await setCalendarEventDone(user, params.id, body.done);
  if (!result.ok) {
    const { status, message } = calendarError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    event: result.data,
    message: body.done ? "Marked as done." : "Marked as not done.",
  });
}
