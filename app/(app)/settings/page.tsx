import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageSettings } from "@/lib/permissions";
import {
  getDepartments,
  getReminderTime,
  getWeekendDays,
} from "@/lib/settings";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const user = await requireUser();
  if (!canManageSettings(user.role)) redirect("/");

  const [departments, weekendDays, reminderTime] = await Promise.all([
    getDepartments(),
    getWeekendDays(),
    getReminderTime(),
  ]);

  return (
    <SettingsView
      initialDepartments={departments}
      initialWeekendDays={weekendDays}
      initialReminderTime={reminderTime}
    />
  );
}
