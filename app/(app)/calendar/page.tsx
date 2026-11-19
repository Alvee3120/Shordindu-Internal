import { requireUser } from "@/lib/auth";
import { dhakaToday } from "@/lib/time";
import { CalendarView } from "@/components/calendar/calendar-view";

export default async function CalendarPage() {
  await requireUser();

  return <CalendarView today={dhakaToday()} />;
}
