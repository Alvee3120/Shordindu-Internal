import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { canManageUsers, canSetRole, type UserRole } from "@/lib/permissions";
import { getDepartments } from "@/lib/settings";
import { getOnLeaveUserIds } from "@/lib/attendance";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  department: true,
  position: true,
  role: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

const pendingUserSelect = {
  id: true,
  name: true,
  email: true,
  department: true,
  position: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PendingUser = Prisma.UserGetPayload<{
  select: typeof pendingUserSelect;
}>;

export type UserManagementFailure =
  | "forbidden"
  | "not_found"
  | "not_pending"
  | "unverified"
  | "cannot_grant_admin"
  | "cannot_manage_admin"
  | "email_exists"
  | "invalid_department"
  | "self_change"
  | "invalid_status"
  | "not_changed";

export type UserManagementResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: UserManagementFailure };

function fail<T>(reason: UserManagementFailure): UserManagementResult<T> {
  return { ok: false, reason };
}

export function userManagementError(reason: UserManagementFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "User not found." };
    case "not_pending":
      return { status: 409, message: "This request is no longer pending." };
    case "unverified":
      return {
        status: 409,
        message: "This user has not verified their email yet.",
      };
    case "cannot_grant_admin":
      return { status: 403, message: "Only an Admin can grant the Admin role." };
    case "cannot_manage_admin":
      return {
        status: 403,
        message: "Only an Admin can change an Admin account.",
      };
    case "email_exists":
      return {
        status: 409,
        message: "A user with this email already exists.",
      };
    case "invalid_department":
      return { status: 400, message: "Choose a valid department." };
    case "self_change":
      return {
        status: 400,
        message: "You cannot change your own role or disable yourself.",
      };
    case "invalid_status":
      return {
        status: 409,
        message: "Only active or disabled accounts can be changed here.",
      };
    case "not_changed":
      return { status: 400, message: "Nothing to update." };
    default:
      return { status: 403, message: "You do not have access to this action." };
  }
}

/** Pending signups whose email is verified, oldest first. */
export async function listPendingUsers(): Promise<PendingUser[]> {
  return prisma.user.findMany({
    where: { status: UserStatus.Pending, emailVerifiedAt: { not: null } },
    select: pendingUserSelect,
    orderBy: { createdAt: "asc" },
  });
}

/** All users, optionally filtered, with today's leave flag. */
export async function searchUsers(
  query = "",
): Promise<(PublicUser & { onLeaveToday: boolean })[]> {
  const search = query.trim();
  const [users, onLeave] = await Promise.all([
    prisma.user.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { department: { contains: search, mode: "insensitive" } },
              { position: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: publicUserSelect,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getOnLeaveUserIds(),
  ]);

  return users.map((user) => ({
    ...user,
    onLeaveToday: onLeave.has(user.id),
  }));
}

export async function approveUser(
  actor: SessionUser,
  targetId: string,
  input: { role: UserRole; department: string; position: string },
): Promise<UserManagementResult<PublicUser>> {
  if (!canManageUsers(actor.role)) return fail("forbidden");
  if (!canSetRole(actor.role, input.role)) return fail("cannot_grant_admin");

  const departments = await getDepartments();
  if (!departments.includes(input.department)) {
    return fail("invalid_department");
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return fail("not_found");
  if (target.status !== UserStatus.Pending) return fail("not_pending");
  if (!target.emailVerifiedAt) return fail("unverified");

  const before = {
    status: target.status,
    role: target.role,
    department: target.department,
    position: target.position,
  };
  const after = {
    status: UserStatus.Active,
    role: input.role,
    department: input.department,
    position: input.position,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetId },
      data: {
        status: UserStatus.Active,
        role: input.role,
        department: input.department,
        position: input.position,
      },
      select: publicUserSelect,
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "user.approved",
        targetType: "user",
        targetId,
        beforeJson: before,
        afterJson: after,
      },
      tx,
    );
    return user;
  });

  return { ok: true, data: updated };
}

export async function rejectUser(
  actor: SessionUser,
  targetId: string,
): Promise<UserManagementResult<PublicUser>> {
  if (!canManageUsers(actor.role)) return fail("forbidden");

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return fail("not_found");
  if (target.status !== UserStatus.Pending) return fail("not_pending");

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetId },
      data: { status: UserStatus.Rejected },
      select: publicUserSelect,
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "user.rejected",
        targetType: "user",
        targetId,
        beforeJson: { status: target.status },
        afterJson: { status: UserStatus.Rejected },
      },
      tx,
    );
    return user;
  });

  return { ok: true, data: updated };
}

export async function createUserByAdmin(
  actor: SessionUser,
  input: {
    name: string;
    email: string;
    department: string;
    position: string;
    role: UserRole;
  },
): Promise<UserManagementResult<PublicUser>> {
  if (!canManageUsers(actor.role)) return fail("forbidden");
  if (!canSetRole(actor.role, input.role)) return fail("cannot_grant_admin");

  const departments = await getDepartments();
  if (!departments.includes(input.department)) {
    return fail("invalid_department");
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) return fail("email_exists");

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        // Active immediately; no password yet, so the invite tells them to set one.
        data: {
          name: input.name,
          email: input.email,
          department: input.department,
          position: input.position,
          role: input.role,
          status: UserStatus.Active,
        },
        select: publicUserSelect,
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "user.created",
          targetType: "user",
          targetId: user.id,
          afterJson: {
            name: input.name,
            email: input.email,
            department: input.department,
            position: input.position,
            role: input.role,
            status: UserStatus.Active,
          },
        },
        tx,
      );
      return user;
    });

    return { ok: true, data: created };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail("email_exists");
    }
    throw error;
  }
}

export async function updateUser(
  actor: SessionUser,
  targetId: string,
  changes: {
    role?: UserRole;
    department?: string;
    status?: "Active" | "Disabled";
  },
): Promise<UserManagementResult<PublicUser>> {
  if (!canManageUsers(actor.role)) return fail("forbidden");

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return fail("not_found");

  // Managers and HR must not touch Admin accounts at all.
  if (target.role === Role.Admin && actor.role !== Role.Admin) {
    return fail("cannot_manage_admin");
  }
  if (
    target.id === actor.id &&
    (changes.role !== undefined || changes.status === "Disabled")
  ) {
    return fail("self_change");
  }
  if (changes.role !== undefined && !canSetRole(actor.role, changes.role)) {
    return fail("cannot_grant_admin");
  }

  if (changes.department !== undefined) {
    const departments = await getDepartments();
    if (!departments.includes(changes.department)) {
      return fail("invalid_department");
    }
  }

  if (changes.status !== undefined) {
    if (
      target.status !== UserStatus.Active &&
      target.status !== UserStatus.Disabled
    ) {
      return fail("invalid_status");
    }
  }

  const data: Prisma.UserUpdateInput = {};
  const auditEntries: {
    action: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }[] = [];

  if (changes.role !== undefined && changes.role !== target.role) {
    data.role = changes.role;
    auditEntries.push({
      action: "user.role_changed",
      before: { role: target.role },
      after: { role: changes.role },
    });
  }
  if (
    changes.department !== undefined &&
    changes.department !== target.department
  ) {
    data.department = changes.department;
    auditEntries.push({
      action: "user.department_changed",
      before: { department: target.department },
      after: { department: changes.department },
    });
  }
  if (changes.status !== undefined && changes.status !== target.status) {
    data.status = changes.status;
    auditEntries.push({
      action:
        changes.status === UserStatus.Disabled
          ? "user.disabled"
          : "user.re_enabled",
      before: { status: target.status },
      after: { status: changes.status },
    });
  }

  if (auditEntries.length === 0) return fail("not_changed");

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetId },
      data,
      select: publicUserSelect,
    });
    for (const entry of auditEntries) {
      await logAudit(
        {
          actorId: actor.id,
          action: entry.action,
          targetType: "user",
          targetId,
          beforeJson: entry.before,
          afterJson: entry.after,
        },
        tx,
      );
    }
    return user;
  });

  return { ok: true, data: updated };
}
