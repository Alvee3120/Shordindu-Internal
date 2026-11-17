import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { NotSubmittedSummary } from "@/lib/attendance";

export function NotSubmittedCard({
  summary,
}: {
  summary: NotSubmittedSummary;
}) {
  let detail: string;
  if (!summary.isWorkingDay) {
    detail =
      summary.reason === "holiday"
        ? `Holiday: ${summary.holidayName}`
        : "Today is a weekend.";
  } else if (summary.missing.length === 0) {
    detail = "Everyone has submitted an update today.";
  } else {
    detail = `${summary.missing.length} active ${
      summary.missing.length === 1 ? "user has" : "users have"
    } not posted today.`;
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 sm:pt-5">
        <div>
          <p className="text-sm font-medium">Not submitted today</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <Link
          href="/not-submitted"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          View list
        </Link>
      </CardContent>
    </Card>
  );
}
