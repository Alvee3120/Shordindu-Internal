import { LeaveStatus, Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canApproveLeave, canMarkLeaveForOthers } from "@/lib/permissions";
import { createNotifications } from "@/lib/notifications";
import type { SessionUser } from "@/lib/auth";

/**
 * Leave requests.
 * Anyone can apply for their own leave with a reason.
 * Manager, HR and Admin approve or reject; an approver never decides their own
 * request. Only Approved leave marks a person as on leave. An approver marking
 * leave directly for someone else is approved straight away, since the marking
 * is itself the decision.
 */

export interface LeaveView {
  id: string;
  userId: string;
  name: string;
  department: string;
  position: string;
  fromDate: Date;
  toDate: Date;
  reason: string;
  status: LeaveStatus;
  decidedBy: { id: string; name: string } | null;
  decidedAt: Date | null;
  createdBy: { id: string; name: string };
  createdAt: Date;
  canDecide: boolean;
}

export type LeaveFailure =
  | "forbidden"
  | "invalid_range"
  | "invalid_user"
  | "not_found"
  | "already_decided"
  | "self_decision";

export function leaveError(reason: LeaveFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "forbidden":
      return {
        status: 403,
        message: "You can only apply for your own leave.",
      };
    case "invalid_range":
      return {
        status: 400,
        message: "The end date must be on or after the start date.",
      };
    case "invalid_user":
      return { status: 400, message: "Choose an active user." };
    case "not_found":
      return { status: 404, message: "Leave request not found." };
    case "already_decided":
      return {
        status: 409,
        message: "This request has already been decided.",
      };
    case "self_decision":
      return {
        status: 403,
        message: "Someone else must approve or reject your own leave.",
      };
  }
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

type LeaveWithRelations = {
  id: string;
  userId: string;
  fromDate: Date;
  toDate: Date;
  reason: string;
  status: LeaveStatus;
  decidedAt: Date | null;
  createdAt: Date;
  user: { name: string; department: string; position: string };
  decidedBy: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
};

function toView(leave: LeaveWithRelations, viewer: SessionUser): LeaveView {
  return {
    id: leave.id,
    userId: leave.userId,
    name: leave.user.name,
    department: leave.user.department,
    position: leave.user.position,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    reason: leave.reason,
    status: leave.status,
    decidedBy: leave.decidedBy,
    decidedAt: leave.decidedAt,
    createdBy: leave.createdBy,
    createdAt: leave.createdAt,
    // Only a pending request, and never your own, can be acted on.
    canDecide:
      canApproveLeave(viewer.role) &&
      leave.status === LeaveStatus.Pending &&
      leave.userId !== viewer.id,
  };
}

const leaveInclude = {
  user: { select: { name: true, department: true, position: true } },
  decidedBy: { select: { id: true, name: true } },
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

  return leaves.map((leave) => toView(leave, viewer));
}

/** Notifies everyone who could decide, so a new request does not sit unseen. */
async function notifyApprovers(actor: SessionUser, leaveId: string): Promise<void> {
  const approvers = await prisma.user.findMany({
    where: {
      status: UserStatus.Active,
      role: { in: [Role.Admin, Role.HR, Role.Manager] },
      id: { not: actor.id },
    },
    select: { id: true },
  });
  if (approvers.length === 0) return;

  await createNotifications(
    actor.id,
    approvers.map((approver) => ({
      userId: approver.id,
      type: "leave_requested",
      message: `${actor.name} applied for leave`,
      link: "/leave?tab=requests",
    })),
  );
}

export async function applyForLeave(
  actor: SessionUser,
  input: {
    userId?: string;
    fromDate: string;
    toDate: string;
    reason: string;
  },
): Promise<
  { ok: true; leave: LeaveView } | { ok: false; reason: LeaveFailure }
> {
  const targetId = input.userId ?? actor.id;
  const isSelf = targetId === actor.id;
  const marksForOthers = !isSelf;

  if (marksForOthers && !canMarkLeaveForOthers(actor.role)) {
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

  // An approver marking leave for someone else is the decision itself.
  const status = marksForOthers ? LeaveStatus.Approved : LeaveStatus.Pending;
  const decidedById = marksForOthers ? actor.id : null;
  const decidedAt = marksForOthers ? new Date() : null;

  const leave = await prisma.$transaction(async (tx) => {
    const created = await tx.leave.create({
      data: {
        userId: targetId,
        fromDate,
        toDate,
        reason: input.reason,
        status,
        decidedById,
        decidedAt,
        createdById: actor.id,
      },
      include: leaveInclude,
    });
    await logAudit(
      {
        actorId: actor.id,
        action:
          status === LeaveStatus.Approved
            ? "leave.marked_approved"
            : "leave.requested",
        targetType: "leave",
        targetId: created.id,
        afterJson: {
          userId: targetId,
          fromDate: input.fromDate,
          toDate: input.toDate,
          reason: input.reason,
          status,
        },
      },
      tx,
    );
    return created;
  });

  if (status === LeaveStatus.Pending) {
    try {
      await notifyApprovers(actor, leave.id);
    } catch (error) {
      console.error("[leave] Could not notify approvers", error);
    }
  }

  return { ok: true, leave: toView(leave, actor) };
}

/** Approves or rejects a pending request. An approver cannot decide their own. */
export async function decideLeave(
  actor: SessionUser,
  leaveId: string,
  decision: "approve" | "reject",
): Promise<
  { ok: true; leave: LeaveView } | { ok: false; reason: LeaveFailure }
> {
  if (!canApproveLeave(actor.role)) return { ok: false, reason: "forbidden" };

  const leave = await prisma.leave.findUnique({
    where: { id: leaveId },
    select: { id: true, userId: true, status: true, fromDate: true, toDate: true },
  });
  if (!leave) return { ok: false, reason: "not_found" };
  if (leave.userId === actor.id) return { ok: false, reason: "self_decision" };
  if (leave.status !== LeaveStatus.Pending) {
    return { ok: false, reason: "already_decided" };
  }

  const status =
    decision === "approve" ? LeaveStatus.Approved : LeaveStatus.Rejected;
  const decidedAt = new Date();

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.leave.update({
      where: { id: leaveId },
      data: { status, decidedById: actor.id, decidedAt },
      include: leaveInclude,
    });
    await logAudit(
      {
        actorId: actor.id,
        action: decision === "approve" ? "leave.approved" : "leave.rejected",
        targetType: "leave",
        targetId: leaveId,
        beforeJson: { status: leave.status },
        afterJson: { status, decidedById: actor.id },
      },
      tx,
    );
    return updated;
  });

  try {
    await createNotifications(actor.id, [
      {
        userId: leave.userId,
        type: "leave_decision",
        message:
          decision === "approve"
            ? `${actor.name} approved your leave`
            : `${actor.name} rejected your leave`,
        link: "/leave",
      },
    ]);
  } catch (error) {
    console.error("[leave] Could not notify the applicant", error);
  }

  return { ok: true, leave: toView(saved, actor) };
}
