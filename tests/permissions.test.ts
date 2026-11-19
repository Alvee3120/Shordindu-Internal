import { describe, expect, it } from "vitest";
import {
  canEditOwnAssignment,
  canGrantAdminRole,
  canManageAnyAssignment,
  canManageHolidays,
  canManageSettings,
  canManageUsers,
  canManageWeekendDays,
  canApproveLeave,
  canMarkLeaveForOthers,
  canPostAnnouncement,
  canPostContent,
  canSetRole,
  canViewAuditLog,
  canViewNotSubmittedList,
  type UserRole,
} from "@/lib/permissions";

type Check = (role: UserRole | null | undefined) => boolean;

const ROLES: UserRole[] = ["Employee", "Manager", "HR", "Admin"];

function expectForEveryRole(check: Check, expected: Record<UserRole, boolean>) {
  for (const role of ROLES) {
    expect(check(role), `role=${role}`).toBe(expected[role]);
  }
}

describe("permission table", () => {
  it("allows posting, commenting, reacting and creating assignments for every role", () => {
    expectForEveryRole(canPostContent, {
      Employee: true,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("allows everyone to edit their own assignment", () => {
    expectForEveryRole(canEditOwnAssignment, {
      Employee: true,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("restricts other people's assignments to Manager, HR and Admin", () => {
    expectForEveryRole(canManageAnyAssignment, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("restricts signup approval and user management to Manager, HR and Admin", () => {
    expectForEveryRole(canManageUsers, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("lets only Admin grant the Admin role", () => {
    expectForEveryRole(canGrantAdminRole, {
      Employee: false,
      Manager: false,
      HR: false,
      Admin: true,
    });
  });

  it("restricts holiday management to Manager, HR and Admin", () => {
    expectForEveryRole(canManageHolidays, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("restricts the weekend setting to Manager, HR and Admin", () => {
    expectForEveryRole(canManageWeekendDays, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("restricts marking leave for others to Manager, HR and Admin", () => {
    expectForEveryRole(canMarkLeaveForOthers, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("lets only Admin see the audit log", () => {
    expectForEveryRole(canViewAuditLog, {
      Employee: false,
      Manager: false,
      HR: false,
      Admin: true,
    });
  });

  it("restricts departments and reminder settings to Manager, HR and Admin", () => {
    expectForEveryRole(canManageSettings, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("restricts the not-submitted list to Manager, HR and Admin", () => {
    expectForEveryRole(canViewNotSubmittedList, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("restricts announcements to Manager, HR and Admin", () => {
    expectForEveryRole(canPostAnnouncement, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });

  it("restricts leave approval to Manager, HR and Admin", () => {
    expectForEveryRole(canApproveLeave, {
      Employee: false,
      Manager: true,
      HR: true,
      Admin: true,
    });
  });
});

describe("canSetRole", () => {
  it("never lets Manager or HR create or promote an Admin", () => {
    expect(canSetRole("Manager", "Admin")).toBe(false);
    expect(canSetRole("HR", "Admin")).toBe(false);
  });

  it("lets Admin set any role", () => {
    for (const role of ROLES) {
      expect(canSetRole("Admin", role), `newRole=${role}`).toBe(true);
    }
  });

  it("never lets an Employee set a role", () => {
    for (const role of ROLES) {
      expect(canSetRole("Employee", role), `newRole=${role}`).toBe(false);
    }
  });

  it("lets Manager and HR set non-Admin roles", () => {
    expect(canSetRole("Manager", "Employee")).toBe(true);
    expect(canSetRole("Manager", "Manager")).toBe(true);
    expect(canSetRole("HR", "Manager")).toBe(true);
  });
});

describe("unauthenticated users", () => {
  it("denies every permission when the role is missing", () => {
    const checks: Check[] = [
      canPostContent,
      canEditOwnAssignment,
      canManageAnyAssignment,
      canManageUsers,
      canGrantAdminRole,
      canManageHolidays,
      canMarkLeaveForOthers,
      canViewAuditLog,
      canViewNotSubmittedList,
      canPostAnnouncement,
      canApproveLeave,
    ];
    for (const check of checks) {
      expect(check(null)).toBe(false);
      expect(check(undefined)).toBe(false);
    }
  });
});
