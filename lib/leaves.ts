import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canMarkLeaveForOthers } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";

export interface LeaveView {
  id: string;
  userId: string;
  name: string;
  department: string;
  position: string;
  fromDate: Date;
  toDate: Date;
  createdBy: { id: string; name: string };
  createdAt: Date;
}

export type LeaveFailure = "forbidden" | "invalid_range" | "invalid_user";

export function leaveError(reason: LeaveFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "forbidden":
      return {
        status: 403,
        message: "You can only mark leave for yourself.",
      };
    case "invalid_range":
      return {
        status: 400,
        message: "The end date must be on or after the start date.",
      };
    case "invalid_user":
      return { status: 400, message: "Choose an active user." };
  }
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toView(leave: {
  id: string;
  userId: string;
  fromDate: Date;
  toDate: Date;
  createdAt: Date;
  user: { name: string; department: string; position: string };
  createdBy: { id: string; name: string };
}): LeaveView {
  return {
    id: leave.id,
    userId: leave.userId,
    name: leave.user.name,
    department: leave.user.department,
    position: leave.user.position,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    createdBy: leave.createdBy,
    createdAt: leave.createdAt,
  };
}

const leaveInclude = {
  user: { select: { name: true, department: true, position: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

/** Everyone sees their own leaves; approvers see all leaves. */
export async function listLeaves(viewer: SessionUser): Promise<LeaveView[]> {
  const leaves = await prisma.leave.findMany({
    where: canMarkLeaveForOthers(viewer.role) ? {} : { userId: viewer.id },
    include: leaveInclude,
    orderBy: [{ fromDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return leaves.map(toView);
}

export async function markLeave(
  actor: SessionUser,
  input: { userId?: string; fromDate: string; toDate: string },
): Promise<
  { ok: true; leave: LeaveView } | { ok: false; reason: LeaveFailure }
> {
  const targetId = input.userId ?? actor.id;

  if (targetId !== actor.id && !canMarkLeaveForOthers(actor.role)) {
    return { ok: false, reason: "forbidden" };
  }
  if (input.fromDate > input.toDate) {
    return { ok: false, reason: "invalid_range" };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, status: true },
  });
  if (!target || target.status !== UserStatus.Active) {
    return { ok: false, reason: "invalid_user" };
  }

  const fromDate = parseDateOnly(input.fromDate);
  const toDate = parseDateOnly(input.toDate);

  const leave = await prisma.$transaction(async (tx) => {
    const created = await tx.leave.create({
      data: {
        userId: targetId,
        fromDate,
        toDate,
        createdById: actor.id,
      },
      include: leaveInclude,
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "leave.created",
        targetType: "leave",
        targetId: created.id,
        afterJson: {
          userId: targetId,
          fromDate: input.fromDate,
          toDate: input.toDate,
        },
      },
      tx,
    );
    return created;
  });

  return { ok: true, leave: toView(leave) };
}
