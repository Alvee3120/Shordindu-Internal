import { requireUser } from "@/lib/auth";
import { getDepartments } from "@/lib/settings";
import { dhakaToday } from "@/lib/time";
import { canViewNotSubmittedList } from "@/lib/permissions";
import { getNotSubmittedToday } from "@/lib/attendance";
import { Feed } from "@/components/feed/feed";
import { NotSubmittedCard } from "@/components/attendance/not-submitted-card";

export default async function FeedPage() {
  const user = await requireUser();

  const departments = await getDepartments();
  const today = dhakaToday();
  const summary = canViewNotSubmittedList(user.role)
    ? await getNotSubmittedToday()
    : null;

  return (
    <div className="space-y-4">
      {summary ? <NotSubmittedCard summary={summary} /> : null}
      <Feed today={today} departments={departments} />
    </div>
  );
}
