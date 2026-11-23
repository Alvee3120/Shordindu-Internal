import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canManageHolidays } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";

export interface HolidayView {
  id: string;
  date: Date;
  name: string;
  createdAt: Date;
}

export type HolidayFailure = "forbidden" | "not_found" | "duplicate";

export function holidayError(reason: HolidayFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "forbidden":
      return {
        status: 403,
        message: "Only HR and Admin can manage holidays.",
      };
    case "not_found":
      return { status: 404, message: "Holiday not found." };
    case "duplicate":
      return { status: 409, message: "A holiday already exists on that date." };
  }
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function listHolidays(): Promise<HolidayView[]> {
  return prisma.holiday.findMany({
    orderBy: { date: "asc" },
    take: 200,
  });
}

export async function createHoliday(
  actor: SessionUser,
  input: { date: string; name: string },
): Promise<
  { ok: true; holiday: HolidayView } | { ok: false; reason: HolidayFailure }
> {
  if (!canManageHolidays(actor.role)) return { ok: false, reason: "forbidden" };

  const date = parseDateOnly(input.date);
  const existing = await prisma.holiday.findUnique({ where: { date } });
  if (existing) return { ok: false, reason: "duplicate" };

  try {
    const holiday = await prisma.$transaction(async (tx) => {
      const created = await tx.holiday.create({
        data: { date, name: input.name },
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "holiday.created",
          targetType: "holiday",
          targetId: created.id,
          afterJson: { date: input.date, name: input.name },
        },
        tx,
      );
      return created;
    });

    return { ok: true, holiday };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, reason: "duplicate" };
    }
    throw error;
  }
}

export async function updateHoliday(
  actor: SessionUser,
  holidayId: string,
  input: { date?: string; name?: string },
): Promise<
  { ok: true; holiday: HolidayView } | { ok: false; reason: HolidayFailure }
> {
  if (!canManageHolidays(actor.role)) return { ok: false, reason: "forbidden" };

  const holiday = await prisma.holiday.findUnique({ where: { id: holidayId } });
  if (!holiday) return { ok: false, reason: "not_found" };

  const date = input.date ? parseDateOnly(input.date) : holiday.date;
  const name = input.name ?? holiday.name;

  if (input.date && dateOnlyString(date) !== dateOnlyString(holiday.date)) {
    const existing = await prisma.holiday.findUnique({ where: { date } });
    if (existing) return { ok: false, reason: "duplicate" };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.holiday.update({
        where: { id: holidayId },
        data: { date, name },
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "holiday.edited",
          targetType: "holiday",
          targetId: holidayId,
          beforeJson: {
            date: dateOnlyString(holiday.date),
            name: holiday.name,
          },
          afterJson: { date: dateOnlyString(date), name },
        },
        tx,
      );
      return saved;
    });

    return { ok: true, holiday: updated };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return { ok: false, reason: "duplicate" };
      if (error.code === "P2025") return { ok: false, reason: "not_found" };
    }
    throw error;
  }
}

export async function deleteHoliday(
  actor: SessionUser,
  holidayId: string,
): Promise<{ ok: true } | { ok: false; reason: HolidayFailure }> {
  if (!canManageHolidays(actor.role)) return { ok: false, reason: "forbidden" };

  const holiday = await prisma.holiday.findUnique({ where: { id: holidayId } });
  if (!holiday) return { ok: false, reason: "not_found" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id: holidayId } });
      await logAudit(
        {
          actorId: actor.id,
          action: "holiday.deleted",
          targetType: "holiday",
          targetId: holidayId,
          beforeJson: {
            date: dateOnlyString(holiday.date),
            name: holiday.name,
          },
        },
        tx,
      );
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { ok: false, reason: "not_found" };
    }
    throw error;
  }

  return { ok: true };
}
