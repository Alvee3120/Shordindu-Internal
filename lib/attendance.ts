import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dhakaToday, isWeekend } from "@/lib/time";
import { getWeekendDays } from "@/lib/settings";

export interface MissingUser {
  id: string;
  name: string;
  position: string;
  department: string;
}

export interface NotSubmittedSummary {
  date: string;
  isWorkingDay: boolean;
  reason: "weekend" | "holiday" | null;
  holidayName: string | null;
  missing: MissingUser[];
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Ids of users whose leave range covers the given Dhaka date. */
export async function getOnLeaveUserIds(
  dateString: string = dhakaToday(),
): Promise<Set<string>> {
  const date = parseDateOnly(dateString);
  const leaves = await prisma.leave.findMany({
    where: { fromDate: { lte: date }, toDate: { gte: date } },
    select: { userId: true },
  });
  return new Set(leaves.map((leave) => leave.userId));
}

/**
 * Active users who have not posted an update for today, excluding weekends,
 * holidays and anyone on leave. Non-working days return an empty list.
 */
export async function getNotSubmittedToday(): Promise<NotSubmittedSummary> {
  const today = dhakaToday();
  const weekendDays = await getWeekendDays();

  if (isWeekend(today, weekendDays)) {
    return {
      date: today,
      isWorkingDay: false,
      reason: "weekend",
      holidayName: null,
      missing: [],
    };
  }

  const date = parseDateOnly(today);
  const holiday = await prisma.holiday.findUnique({ where: { date } });
  if (holiday) {
    return {
      date: today,
      isWorkingDay: false,
      reason: "holiday",
      holidayName: holiday.name,
      missing: [],
    };
  }

  const [users, submitted, onLeave] = await Promise.all([
    prisma.user.findMany({
      where: { status: UserStatus.Active },
      select: { id: true, name: true, position: true, department: true },
      orderBy: { name: "asc" },
    }),
    prisma.update.findMany({
      where: { updateDate: date, deletedAt: null },
      select: { userId: true },
    }),
    getOnLeaveUserIds(today),
  ]);

  const submittedIds = new Set(submitted.map((update) => update.userId));

  return {
    date: today,
    isWorkingDay: true,
    reason: null,
    holidayName: null,
    missing: users.filter(
      (user) => !submittedIds.has(user.id) && !onLeave.has(user.id),
    ),
  };
}
