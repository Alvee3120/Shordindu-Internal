import { requireUser } from "@/lib/auth";
import { dhakaToday } from "@/lib/time";
import {
  canApproveLeave,
  canManageHolidays,
  canManageWeekendDays,
  canMarkLeaveForOthers,
} from "@/lib/permissions";
import { getWeekendDays } from "@/lib/settings";
import { LeaveView } from "@/components/leave/leave-view";

export default async function LeavePage() {
  const user = await requireUser();
  const weekendDays = await getWeekendDays();

  return (
    <LeaveView
      today={dhakaToday()}
      initialWeekendDays={weekendDays}
      canMarkForOthers={canMarkLeaveForOthers(user.role)}
      canApprove={canApproveLeave(user.role)}
      canManageHolidays={canManageHolidays(user.role)}
      canManageWeekend={canManageWeekendDays(user.role)}
    />
  );
}
