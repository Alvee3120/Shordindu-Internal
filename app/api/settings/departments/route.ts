import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { departmentsSettingSchema } from "@/lib/validators";
import { canManageSettings } from "@/lib/permissions";
import { DEFAULT_DEPARTMENTS } from "@/lib/constants";
import { getSetting, setDepartments } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

export async function PATCH(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  if (!canManageSettings(user.role)) {
    return NextResponse.json(
      { error: "Only an Admin can change departments." },
      { status: 403 },
    );
  }

  const parsed = departmentsSettingSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the departments." },
      { status: 400 },
    );
  }

  const before = await getSetting<string[]>(
    "departments",
    DEFAULT_DEPARTMENTS,
  );
  await setDepartments(parsed.data.departments);
  await logAudit({
    actorId: user.id,
    action: "settings.departments_changed",
    targetType: "settings",
    targetId: "departments",
    beforeJson: { departments: before },
    afterJson: { departments: parsed.data.departments },
  });

  return NextResponse.json({
    departments: parsed.data.departments,
    message: "Departments updated.",
  });
}
