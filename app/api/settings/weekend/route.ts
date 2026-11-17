import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { weekendSchema } from "@/lib/validators";
import { canManageWeekendDays } from "@/lib/permissions";
import { getWeekendDays, setWeekendDays } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  return NextResponse.json({
    days: await getWeekendDays(),
    canManage: canManageWeekendDays(user.role),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  if (!canManageWeekendDays(user.role)) {
    return NextResponse.json(
      { error: "Only HR and Admin can change the weekend." },
      { status: 403 },
    );
  }

  const parsed = weekendSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid days." },
      { status: 400 },
    );
  }

  const before = await getWeekendDays();
  await setWeekendDays(parsed.data.days);
  await logAudit({
    actorId: user.id,
    action: "settings.weekend_changed",
    targetType: "settings",
    targetId: "weekend_days",
    beforeJson: { days: before },
    afterJson: { days: parsed.data.days },
  });

  return NextResponse.json({
    days: parsed.data.days,
    message: "Weekend updated.",
  });
}
