import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { holidaySchema } from "@/lib/validators";
import { canManageHolidays } from "@/lib/permissions";
import {
  createHoliday,
  holidayError,
  listHolidays,
} from "@/lib/holidays";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const holidays = await listHolidays();
  return NextResponse.json({
    holidays,
    canManage: canManageHolidays(user.role),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = holidaySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the holiday." },
      { status: 400 },
    );
  }

  const result = await createHoliday(user, parsed.data);
  if (!result.ok) {
    const { status, message } = holidayError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { holiday: result.holiday, message: "Holiday added." },
    { status: 201 },
  );
}
