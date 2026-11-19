import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import {
  calendarEventSchema,
  calendarRangeSchema,
  formatFieldErrors,
} from "@/lib/validators";
import {
  calendarError,
  createCalendarEvent,
  listCalendar,
} from "@/lib/calendar";

export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const params = request.nextUrl.searchParams;
  const parsed = calendarRangeSchema.safeParse({
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a valid range." },
      { status: 400 },
    );
  }

  const items = await listCalendar(user, parsed.data.from, parsed.data.to);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = calendarEventSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the entry.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await createCalendarEvent(user, parsed.data);
  if (!result.ok) {
    const { status, message } = calendarError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { event: result.data, message: "Added to your calendar." },
    { status: 201 },
  );
}
