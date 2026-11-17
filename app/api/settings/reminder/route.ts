import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { reminderTimeSchema } from "@/lib/validators";
import { canManageSettings } from "@/lib/permissions";
import { getReminderTime, setReminderTime } from "@/lib/settings";
import { resyncReminderSchedules } from "@/lib/queue";
import { logAudit } from "@/lib/audit";

export async function PATCH(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  if (!canManageSettings(user.role)) {
    return NextResponse.json(
      { error: "Only an Admin can change the reminder time." },
      { status: 403 },
    );
  }

  const parsed = reminderTimeSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Use HH:MM." },
      { status: 400 },
    );
  }

  const before = await getReminderTime();
  await setReminderTime(parsed.data.time);

  let scheduleNote = "";
  try {
    await resyncReminderSchedules();
  } catch (error) {
    console.error("[settings] Could not reschedule the reminder", error);
    scheduleNote = " The schedule will refresh when the server restarts.";
  }

  await logAudit({
    actorId: user.id,
    action: "settings.reminder_changed",
    targetType: "settings",
    targetId: "reminder_time",
    beforeJson: { time: before },
    afterJson: { time: parsed.data.time },
  });

  return NextResponse.json({
    time: parsed.data.time,
    message: `Reminder time updated.${scheduleNote}`,
  });
}
