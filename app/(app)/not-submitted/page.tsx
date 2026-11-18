import { redirect } from "next/navigation";
import { CheckCircle2, UserX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canViewNotSubmittedList } from "@/lib/permissions";
import { getNotSubmittedToday } from "@/lib/attendance";
import { EmptyState } from "@/components/ui/empty-state";
import { UserCard } from "@/components/ui/user-card";
import { formatDhakaDate } from "@/lib/time";

export default async function NotSubmittedPage() {
  const user = await requireUser();
  if (!canViewNotSubmittedList(user.role)) redirect("/");

  const summary = await getNotSubmittedToday();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Not submitted today
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDhakaDate(summary.date)} &middot; Active users without an
          update, excluding weekends, holidays and leave.
        </p>
      </header>

      {!summary.isWorkingDay ? (
        <EmptyState
          icon={CheckCircle2}
          title={
            summary.reason === "holiday"
              ? `Holiday: ${summary.holidayName}`
              : "Today is a weekend"
          }
          description="No update is expected today."
        />
      ) : summary.missing.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Everyone has submitted"
          description="All active users posted an update for today."
        />
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {summary.missing.length}{" "}
            {summary.missing.length === 1 ? "person has" : "people have"} not
            submitted:
          </p>
          {summary.missing.map((missing) => (
            <div
              key={missing.id}
              className="rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <UserCard
                name={missing.name}
                position={missing.position}
                department={missing.department}
                size="sm"
              />
            </div>
          ))}
        </section>
      )}

      {summary.isWorkingDay && summary.missing.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserX className="h-3.5 w-3.5" />
          The 7 PM reminder will email this list once Module 11 is built.
        </p>
      ) : null}
    </div>
  );
}
