import { afterAll, describe, expect, it } from "vitest";
import { Role, UserStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  approveUser,
  createUserByAdmin,
  listPendingUsers,
  rejectUser,
  searchUsers,
  updateUser,
} from "@/lib/user-management";

const createdIds: string[] = [];

function freshEmail(label: string): string {
  return `um-test-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
}

async function createUser({
  name = "Test User",
  role = Role.Employee,
  status = UserStatus.Active,
  verified = true,
  department = "IT",
}: {
  name?: string;
  role?: Role | null;
  status?: UserStatus;
  verified?: boolean;
  department?: string;
} = {}): Promise<User> {
  const user = await prisma.user.create({
    data: {
      name,
      email: freshEmail("user"),
      department,
      position: "Tester",
      role,
      status,
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
  createdIds.push(user.id);
  return user;
}

function asActor(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department,
    position: user.position,
    avatarFile: user.avatarFile,
  };
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: createdIds } },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
});

describe("approveUser", () => {
  it("activates a verified signup with the chosen role, department and position", async () => {
    const admin = await createUser({ name: "Admin", role: Role.Admin });
    const applicant = await createUser({
      name: "Applicant",
      role: null,
      status: UserStatus.Pending,
    });

    const result = await approveUser(asActor(admin), applicant.id, {
      role: "Employee",
      department: "Supply Chain",
      position: "Executive",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe(UserStatus.Active);
      expect(result.data.role).toBe(Role.Employee);
      expect(result.data.department).toBe("Supply Chain");
      expect(result.data.position).toBe("Executive");
    }

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: applicant.id, action: "user.approved" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses to let Manager or HR grant the Admin role", async () => {
    const manager = await createUser({ name: "Manager", role: Role.Manager });
    const applicant = await createUser({
      role: null,
      status: UserStatus.Pending,
    });

    expect(
      await approveUser(asActor(manager), applicant.id, {
        role: "Admin",
        department: "IT",
        position: "Boss",
      }),
    ).toEqual({ ok: false, reason: "cannot_grant_admin" });
  });

  it("refuses to approve a signup whose email is not verified", async () => {
    const admin = await createUser({ role: Role.Admin });
    const applicant = await createUser({
      role: null,
      status: UserStatus.Pending,
      verified: false,
    });

    expect(
      await approveUser(asActor(admin), applicant.id, {
        role: "Employee",
        department: "IT",
        position: "Tester",
      }),
    ).toEqual({ ok: false, reason: "unverified" });
  });

  it("refuses to approve a request that is no longer pending", async () => {
    const admin = await createUser({ role: Role.Admin });
    const active = await createUser({ status: UserStatus.Active });

    expect(
      await approveUser(asActor(admin), active.id, {
        role: "Employee",
        department: "IT",
        position: "Tester",
      }),
    ).toEqual({ ok: false, reason: "not_pending" });
  });

  it("blocks Employees from approving anyone", async () => {
    const employee = await createUser({ role: Role.Employee });
    const applicant = await createUser({
      role: null,
      status: UserStatus.Pending,
    });

    expect(
      await approveUser(asActor(employee), applicant.id, {
        role: "Employee",
        department: "IT",
        position: "Tester",
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("rejectUser", () => {
  it("marks a pending signup as Rejected and audits it", async () => {
    const hr = await createUser({ role: Role.HR });
    const applicant = await createUser({
      role: null,
      status: UserStatus.Pending,
    });

    const result = await rejectUser(asActor(hr), applicant.id);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe(UserStatus.Rejected);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: applicant.id, action: "user.rejected" },
    });
    expect(audit).not.toBeNull();
  });
});

describe("createUserByAdmin", () => {
  it("creates an Active user immediately and audits it", async () => {
    const admin = await createUser({ role: Role.Admin });

    const result = await createUserByAdmin(asActor(admin), {
      name: "Invited Person",
      email: freshEmail("invited"),
      department: "Finance",
      position: "Analyst",
      role: "Employee",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      createdIds.push(result.data.id);
      expect(result.data.status).toBe(UserStatus.Active);
      expect(result.data.role).toBe(Role.Employee);
    }

    const audit = await prisma.auditLog.findFirst({
      where: {
        targetId: result.ok ? result.data.id : "",
        action: "user.created",
      },
    });
    expect(audit).not.toBeNull();
  });

  it("does not let Manager or HR create an Admin", async () => {
    const manager = await createUser({ role: Role.Manager });

    expect(
      await createUserByAdmin(asActor(manager), {
        name: "Sneaky Admin",
        email: freshEmail("sneaky"),
        department: "IT",
        position: "Admin",
        role: "Admin",
      }),
    ).toEqual({ ok: false, reason: "cannot_grant_admin" });
  });

  it("rejects a duplicate email", async () => {
    const admin = await createUser({ role: Role.Admin });
    const existing = await createUser({});

    expect(
      await createUserByAdmin(asActor(admin), {
        name: "Duplicate",
        email: existing.email,
        department: "IT",
        position: "Tester",
        role: "Employee",
      }),
    ).toEqual({ ok: false, reason: "email_exists" });
  });
});

describe("updateUser", () => {
  it("lets an Admin change a role and audits the change", async () => {
    const admin = await createUser({ role: Role.Admin });
    const target = await createUser({ role: Role.Employee });

    const result = await updateUser(asActor(admin), target.id, {
      role: "Manager",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.role).toBe(Role.Manager);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: target.id, action: "user.role_changed" },
    });
    expect(audit).not.toBeNull();
  });

  it("stops Manager and HR from changing an Admin account", async () => {
    const hr = await createUser({ role: Role.HR });
    const targetAdmin = await createUser({ role: Role.Admin });

    expect(
      await updateUser(asActor(hr), targetAdmin.id, { role: "Employee" }),
    ).toEqual({ ok: false, reason: "cannot_manage_admin" });
  });

  it("prevents changing your own role or disabling yourself", async () => {
    const admin = await createUser({ role: Role.Admin });

    expect(
      await updateUser(asActor(admin), admin.id, { role: "Manager" }),
    ).toEqual({ ok: false, reason: "self_change" });

    expect(
      await updateUser(asActor(admin), admin.id, { status: "Disabled" }),
    ).toEqual({ ok: false, reason: "self_change" });
  });

  it("disables and re-enables an account", async () => {
    const admin = await createUser({ role: Role.Admin });
    const target = await createUser({ role: Role.Employee });

    const disabled = await updateUser(asActor(admin), target.id, {
      status: "Disabled",
    });
    expect(disabled.ok).toBe(true);
    if (disabled.ok) expect(disabled.data.status).toBe(UserStatus.Disabled);

    const enabled = await updateUser(asActor(admin), target.id, {
      status: "Active",
    });
    expect(enabled.ok).toBe(true);
    if (enabled.ok) expect(enabled.data.status).toBe(UserStatus.Active);

    const disabledAudit = await prisma.auditLog.findFirst({
      where: { targetId: target.id, action: "user.disabled" },
    });
    const enabledAudit = await prisma.auditLog.findFirst({
      where: { targetId: target.id, action: "user.re_enabled" },
    });
    expect(disabledAudit).not.toBeNull();
    expect(enabledAudit).not.toBeNull();
  });

  it("cannot activate a Pending account from the user list", async () => {
    const admin = await createUser({ role: Role.Admin });
    const pending = await createUser({
      role: null,
      status: UserStatus.Pending,
    });

    expect(
      await updateUser(asActor(admin), pending.id, { status: "Active" }),
    ).toEqual({ ok: false, reason: "invalid_status" });
  });

  it("reports when nothing actually changed", async () => {
    const admin = await createUser({ role: Role.Admin });
    const target = await createUser({ department: "IT" });

    expect(
      await updateUser(asActor(admin), target.id, { department: "IT" }),
    ).toEqual({ ok: false, reason: "not_changed" });
  });
});

describe("listPendingUsers", () => {
  it("shows verified pending signups only", async () => {
    const verified = await createUser({
      name: "Verified Pending",
      role: null,
      status: UserStatus.Pending,
    });
    const unverified = await createUser({
      name: "Unverified Pending",
      role: null,
      status: UserStatus.Pending,
      verified: false,
    });

    const pending = await listPendingUsers();
    const ids = pending.map((user) => user.id);

    expect(ids).toContain(verified.id);
    expect(ids).not.toContain(unverified.id);
  });
});

describe("searchUsers", () => {
  it("finds users by name and email", async () => {
    const unique = `Zeta${Math.random().toString(36).slice(2, 8)}`;
    const user = await createUser({ name: `${unique} Searchable` });

    const byName = await searchUsers(unique.toLowerCase());
    expect(byName.some((found) => found.id === user.id)).toBe(true);

    const byEmail = await searchUsers(user.email);
    expect(byEmail.some((found) => found.id === user.id)).toBe(true);
  });
});
