import {
  AssignmentPriority,
  AssignmentStatus,
  AssigneeStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { dhakaToday } from "@/lib/time";
import { extractPlainText, sanitizeRichText } from "@/lib/sanitize";
import { canManageAnyAssignment, canPostContent } from "@/lib/permissions";
import {
  notifyAssignmentCreated,
  notifyAssignmentStatusChanged,
} from "@/lib/notifications";
import type { SessionUser } from "@/lib/auth";

export type AssignmentFailure =
  | "not_found"
  | "forbidden"
  | "empty_content"
  | "invalid_assignees"
  | "invalid_state"
  | "started"
  | "no_changes";

export type AssignmentResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AssignmentFailure };

export function assignmentError(reason: AssignmentFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "Assignment not found." };
    case "forbidden":
      return { status: 403, message: "You do not have access to this assignment." };
    case "empty_content":
      return { status: 400, message: "Write the instruction before saving." };
    case "invalid_assignees":
      return { status: 400, message: "Choose at least one active assignee." };
    case "invalid_state":
      return { status: 409, message: "This assignment can no longer be changed." };
    case "started":
      return {
        status: 409,
        message: "Someone has already started this assignment. Cancel it instead.",
      };
    case "no_changes":
      return { status: 400, message: "Nothing to update." };
  }
}

export interface AssignmentAssigneeView {
  userId: string;
  name: string;
  position: string;
  department: string;
  avatarFile: string | null;
  status: AssigneeStatus;
  doneNote: string | null;
  doneAt: Date | null;
  isViewer: boolean;
}

export interface AssignmentView {
  id: string;
  contentHtml: string;
  dueDate: Date | null;
  priority: AssignmentPriority;
  status: AssignmentStatus;
  createdAt: Date;
  editedAt: Date | null;
  creator: {
    id: string;
    name: string;
    position: string;
    department: string;
    avatarFile: string | null;
  };
  assignees: AssignmentAssigneeView[];
  progress: { done: number; total: number };
  overdue: boolean;
  canManage: boolean;
  canDelete: boolean;
  canUpdateOwnStatus: boolean;
}

export interface AssignmentFilters {
  view?: "to_me" | "by_me" | "all";
  personId?: string;
  department?: string;
  status?: AssignmentStatus;
  dueFrom?: string;
  dueTo?: string;
}

const assignmentInclude = {
  createdBy: {
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      avatarFile: true,
    },
  },
  assignees: {
    where: { removedAt: null },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          position: true,
          department: true,
          avatarFile: true,
        },
      },
    },
    orderBy: { userId: "asc" },
  },
} satisfies Prisma.AssignmentInclude;

type AssignmentWithRelations = Prisma.AssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toView(
  assignment: AssignmentWithRelations,
  viewer: SessionUser,
): AssignmentView {
  const assignees = assignment.assignees.map((assignee) => ({
    userId: assignee.userId,
    name: assignee.user.name,
    position: assignee.user.position,
    department: assignee.user.department,
    avatarFile: assignee.user.avatarFile,
    status: assignee.status,
    doneNote: assignee.doneNote,
    doneAt: assignee.doneAt,
    isViewer: assignee.userId === viewer.id,
  }));

  const done = assignees.filter((assignee) => assignee.status === "done").length;
  const total = assignees.length;
  const canManage =
    assignment.createdById === viewer.id ||
    canManageAnyAssignment(viewer.role);
  const today = dhakaToday();
  const overdue =
    assignment.dueDate !== null &&
    assignment.status === AssignmentStatus.open &&
    dateOnlyString(assignment.dueDate) < today;

  return {
    id: assignment.id,
    contentHtml: assignment.contentHtml,
    dueDate: assignment.dueDate,
    priority: assignment.priority,
    status: assignment.status,
    createdAt: assignment.createdAt,
    editedAt: assignment.editedAt,
    creator: assignment.createdBy,
    assignees,
    progress: { done, total },
    overdue,
    canManage,
    canDelete:
      canManage &&
      assignment.status === AssignmentStatus.open &&
      assignees.every((assignee) => assignee.status === AssigneeStatus.pending),
    canUpdateOwnStatus:
      assignment.status === AssignmentStatus.open &&
      assignees.some((assignee) => assignee.isViewer),
  };
}

function overallStatus(statuses: AssigneeStatus[]): AssignmentStatus {
  if (statuses.length > 0 && statuses.every((status) => status === "done")) {
    return AssignmentStatus.completed;
  }
  return AssignmentStatus.open;
}

export async function listAssignments(
  viewer: SessionUser,
  filters: AssignmentFilters,
): Promise<AssignmentView[]> {
  const conditions: Prisma.AssignmentWhereInput[] = [{ deletedAt: null }];

  if (filters.view === "to_me") {
    conditions.push({
      assignees: { some: { userId: viewer.id, removedAt: null } },
    });
  }
  if (filters.view === "by_me") {
    conditions.push({ createdById: viewer.id });
  }
  if (filters.personId) {
    conditions.push({
      OR: [
        { createdById: filters.personId },
        {
          assignees: {
            some: { userId: filters.personId, removedAt: null },
          },
        },
      ],
    });
  }
  if (filters.department) {
    conditions.push({
      OR: [
        { createdBy: { department: filters.department } },
        {
          assignees: {
            some: {
              removedAt: null,
              user: { department: filters.department },
            },
          },
        },
      ],
    });
  }
  if (filters.status) {
    conditions.push({ status: filters.status });
  }
  if (filters.dueFrom) {
    conditions.push({ dueDate: { gte: parseDateOnly(filters.dueFrom) } });
  }
  if (filters.dueTo) {
    conditions.push({ dueDate: { lte: parseDateOnly(filters.dueTo) } });
  }

  const assignments = await prisma.assignment.findMany({
    where: { AND: conditions },
    include: assignmentInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return assignments.map((assignment) => toView(assignment, viewer));
}

export async function createAssignment(
  actor: SessionUser,
  input: {
    contentHtml: string;
    assigneeIds?: string[];
    department?: string;
    dueDate?: string | null;
    priority?: AssignmentPriority;
  },
): Promise<AssignmentResult<AssignmentView>> {
  if (!canPostContent(actor.role)) return { ok: false, reason: "forbidden" };

  const html = sanitizeRichText(input.contentHtml);
  const text = extractPlainText(html);
  if (!text) return { ok: false, reason: "empty_content" };

  const requestedIds = new Set(input.assigneeIds ?? []);
  if (input.department) {
    const members = await prisma.user.findMany({
      where: { department: input.department, status: UserStatus.Active },
      select: { id: true },
    });
    for (const member of members) requestedIds.add(member.id);
  }

  const activeUsers = requestedIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(requestedIds) }, status: UserStatus.Active },
        select: { id: true },
      })
    : [];

  if (activeUsers.length === 0) {
    return { ok: false, reason: "invalid_assignees" };
  }

  const assigneeIds = activeUsers.map((user) => user.id);
  const dueDate = input.dueDate ? parseDateOnly(input.dueDate) : null;
  const priority = input.priority ?? AssignmentPriority.normal;

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        createdById: actor.id,
        contentHtml: html,
        dueDate,
        priority,
        status: AssignmentStatus.open,
        assignees: {
          createMany: {
            data: assigneeIds.map((userId) => ({ userId })),
            skipDuplicates: true,
          },
        },
      },
      include: assignmentInclude,
    });

    await logAudit(
      {
        actorId: actor.id,
        action: "assignment.created",
        targetType: "assignment",
        targetId: created.id,
        afterJson: {
          contentHtml: html,
          dueDate: dueDate ? dateOnlyString(dueDate) : null,
          priority,
          assigneeIds,
        },
      },
      tx,
    );

    return created;
  });

  try {
    await notifyAssignmentCreated({
      actor,
      assignmentId: assignment.id,
      assigneeIds: assigneeIds.filter((userId) => userId !== actor.id),
      summary: text,
    });
  } catch (error) {
    console.error("[notifications] Could not notify assignees", error);
  }

  return { ok: true, data: toView(assignment, actor) };
}

async function findAssignment(id: string): Promise<AssignmentWithRelations | null> {
  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: assignmentInclude,
  });
  if (!assignment || assignment.deletedAt) return null;
  return assignment;
}

function canManage(actor: SessionUser, assignment: { createdById: string }): boolean {
  return (
    assignment.createdById === actor.id || canManageAnyAssignment(actor.role)
  );
}

export async function updateAssignment(
  actor: SessionUser,
  assignmentId: string,
  input: {
    contentHtml?: string;
    dueDate?: string | null;
    priority?: AssignmentPriority;
    addAssigneeIds?: string[];
    removeAssigneeIds?: string[];
  },
): Promise<AssignmentResult<AssignmentView>> {
  const assignment = await findAssignment(assignmentId);
  if (!assignment) return { ok: false, reason: "not_found" };
  if (!canManage(actor, assignment)) return { ok: false, reason: "forbidden" };
  if (assignment.status === AssignmentStatus.cancelled) {
    return { ok: false, reason: "invalid_state" };
  }

  const data: Prisma.AssignmentUpdateInput = {};
  const audits: {
    action: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }[] = [];

  if (input.contentHtml !== undefined) {
    const html = sanitizeRichText(input.contentHtml);
    if (!extractPlainText(html)) return { ok: false, reason: "empty_content" };
    if (html !== assignment.contentHtml) {
      data.contentHtml = html;
      data.editedAt = new Date();
      audits.push({
        action: "assignment.edited",
        before: { contentHtml: assignment.contentHtml },
        after: { contentHtml: html },
      });
    }
  }

  if (input.dueDate !== undefined) {
    const dueDate = input.dueDate ? parseDateOnly(input.dueDate) : null;
    const before = assignment.dueDate ? dateOnlyString(assignment.dueDate) : null;
    const after = dueDate ? dateOnlyString(dueDate) : null;
    if (before !== after) {
      data.dueDate = dueDate;
      audits.push({ action: "assignment.due_changed", before: { dueDate: before }, after: { dueDate: after } });
    }
  }

  if (input.priority !== undefined && input.priority !== assignment.priority) {
    data.priority = input.priority;
    audits.push({
      action: "assignment.priority_changed",
      before: { priority: assignment.priority },
      after: { priority: input.priority },
    });
  }

  const currentAssignees = new Map(
    assignment.assignees.map((assignee) => [assignee.userId, assignee]),
  );
  const addIds = new Set(input.addAssigneeIds ?? []);
  const removeIds = new Set(input.removeAssigneeIds ?? []);

  for (const id of Array.from(removeIds)) {
    if (!currentAssignees.has(id)) removeIds.delete(id);
  }
  for (const id of Array.from(addIds)) {
    if (currentAssignees.has(id) && !removeIds.has(id)) addIds.delete(id);
  }

  const addUsers = addIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(addIds) }, status: UserStatus.Active },
        select: { id: true },
      })
    : [];
  const addedIds = addUsers.map((user) => user.id);

  const finalCount = currentAssignees.size - removeIds.size + addedIds.length;
  if (finalCount < 1) return { ok: false, reason: "invalid_assignees" };

  if (audits.length === 0 && removeIds.size === 0 && addedIds.length === 0) {
    return { ok: false, reason: "no_changes" };
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (addedIds.length > 0) {
      for (const userId of addedIds) {
        await tx.assignmentAssignee.upsert({
          where: {
            assignmentId_userId: { assignmentId, userId },
          },
          update: {
            removedAt: null,
            status: AssigneeStatus.pending,
            doneNote: null,
            doneAt: null,
          },
          create: { assignmentId, userId },
        });
        await logAudit(
          {
            actorId: actor.id,
            action: "assignment.assignee_added",
            targetType: "assignment",
            targetId: assignmentId,
            afterJson: { userId },
          },
          tx,
        );
      }
    }

    for (const userId of Array.from(removeIds)) {
      await tx.assignmentAssignee.update({
        where: { assignmentId_userId: { assignmentId, userId } },
        data: { removedAt: new Date() },
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "assignment.assignee_removed",
          targetType: "assignment",
          targetId: assignmentId,
          beforeJson: { userId, removedAt: null },
          afterJson: { userId, removedAt: new Date().toISOString() },
        },
        tx,
      );
    }

    const activeAssignees = await tx.assignmentAssignee.findMany({
      where: { assignmentId, removedAt: null },
      select: { status: true },
    });
    const nextStatus = overallStatus(
      activeAssignees.map((assignee) => assignee.status),
    );
    if (nextStatus !== assignment.status) {
      data.status = nextStatus;
      audits.push({
        action: "assignment.status_changed",
        before: { status: assignment.status },
        after: { status: nextStatus },
      });
    }

    const saved = await tx.assignment.update({
      where: { id: assignmentId },
      data,
      include: assignmentInclude,
    });

    for (const audit of audits) {
      await logAudit(
        {
          actorId: actor.id,
          action: audit.action,
          targetType: "assignment",
          targetId: assignmentId,
          beforeJson: audit.before,
          afterJson: audit.after,
        },
        tx,
      );
    }

    return saved;
  });

  if (addedIds.length > 0) {
    try {
      await notifyAssignmentCreated({
        actor,
        assignmentId,
        assigneeIds: addedIds,
        summary: extractPlainText(updated.contentHtml),
      });
    } catch (error) {
      console.error("[notifications] Could not notify added assignees", error);
    }
  }

  return { ok: true, data: toView(updated, actor) };
}

export async function updateAssigneeStatus(
  actor: SessionUser,
  assignmentId: string,
  input: { status: AssigneeStatus; note?: string },
): Promise<AssignmentResult<AssignmentView>> {
  const assignment = await findAssignment(assignmentId);
  if (!assignment) return { ok: false, reason: "not_found" };
  if (assignment.status === AssignmentStatus.cancelled) {
    return { ok: false, reason: "invalid_state" };
  }

  const own = assignment.assignees.find(
    (assignee) => assignee.userId === actor.id,
  );
  if (!own) return { ok: false, reason: "forbidden" };

  const note = input.status === AssigneeStatus.done
    ? (input.note?.trim() || null)
    : null;
  const doneAt = input.status === AssigneeStatus.done ? new Date() : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.assignmentAssignee.update({
      where: {
        assignmentId_userId: { assignmentId, userId: actor.id },
      },
      data: { status: input.status, doneNote: note, doneAt },
    });

    const activeAssignees = await tx.assignmentAssignee.findMany({
      where: { assignmentId, removedAt: null },
      select: { status: true },
    });
    const nextStatus = overallStatus(
      activeAssignees.map((assignee) => assignee.status),
    );

    const saved = await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        status:
          assignment.status === AssignmentStatus.cancelled
            ? assignment.status
            : nextStatus,
      },
      include: assignmentInclude,
    });

    await logAudit(
      {
        actorId: actor.id,
        action: "assignment.status_changed",
        targetType: "assignment",
        targetId: assignmentId,
        beforeJson: { assigneeStatus: own.status, assignmentStatus: assignment.status },
        afterJson: {
          assigneeStatus: input.status,
          assignmentStatus: saved.status,
        },
      },
      tx,
    );

    return saved;
  });

  if (
    input.status === AssigneeStatus.done &&
    assignment.createdById !== actor.id
  ) {
    try {
      await notifyAssignmentStatusChanged({
        actor,
        assignmentId,
        recipientIds: [assignment.createdById],
        statusLabel: "Done",
      });
    } catch (error) {
      console.error("[notifications] Could not notify the creator", error);
    }
  }

  return { ok: true, data: toView(updated, actor) };
}

export async function cancelAssignment(
  actor: SessionUser,
  assignmentId: string,
): Promise<AssignmentResult<AssignmentView>> {
  const assignment = await findAssignment(assignmentId);
  if (!assignment) return { ok: false, reason: "not_found" };
  if (!canManage(actor, assignment)) return { ok: false, reason: "forbidden" };
  if (assignment.status === AssignmentStatus.cancelled) {
    return { ok: false, reason: "invalid_state" };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.assignment.update({
      where: { id: assignmentId },
      data: { status: AssignmentStatus.cancelled },
      include: assignmentInclude,
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "assignment.cancelled",
        targetType: "assignment",
        targetId: assignmentId,
        beforeJson: { status: assignment.status },
        afterJson: { status: AssignmentStatus.cancelled },
      },
      tx,
    );
    return saved;
  });

  return { ok: true, data: toView(updated, actor) };
}

export async function deleteAssignment(
  actor: SessionUser,
  assignmentId: string,
): Promise<AssignmentResult<true>> {
  const assignment = await findAssignment(assignmentId);
  if (!assignment) return { ok: false, reason: "not_found" };
  if (!canManage(actor, assignment)) return { ok: false, reason: "forbidden" };
  if (
    assignment.assignees.some(
      (assignee) => assignee.status !== AssigneeStatus.pending,
    )
  ) {
    return { ok: false, reason: "started" };
  }

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { deletedAt },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "assignment.deleted",
        targetType: "assignment",
        targetId: assignmentId,
        beforeJson: { deletedAt: null },
        afterJson: { deletedAt: deletedAt.toISOString() },
      },
      tx,
    );
  });

  return { ok: true, data: true };
}
