/**
 * Role-Based Permission Checkers.
 * Role decides every permission; `position` is display-only and never checked here.
 * Status (Active) is checked separately at authentication time.
 */

export type UserRole = "Admin" | "HR" | "Manager" | "Employee";

type MaybeRole = UserRole | null | undefined;

const ALL_ROLES: UserRole[] = ["Admin", "HR", "Manager", "Employee"];
const APPROVERS: UserRole[] = ["Admin", "HR", "Manager"];
const HR_AND_ADMIN: UserRole[] = ["Admin", "HR"];

function hasAnyRole(role: MaybeRole, allowed: readonly UserRole[]): boolean {
  return role != null && allowed.includes(role);
}

/** Post updates, comment, react, and create assignments. */
export function canPostContent(role: MaybeRole): boolean {
  return hasAnyRole(role, ALL_ROLES);
}

/** Edit or cancel an assignment you created (or are assigned to). */
export function canEditOwnAssignment(role: MaybeRole): boolean {
  return hasAnyRole(role, ALL_ROLES);
}

/** Edit, reassign or cancel anyone's assignment. */
export function canManageAnyAssignment(role: MaybeRole): boolean {
  return hasAnyRole(role, APPROVERS);
}

/** Approve or reject signups, add users, and set a role. */
export function canManageUsers(role: MaybeRole): boolean {
  return hasAnyRole(role, APPROVERS);
}

/** Only an Admin can grant the Admin role. */
export function canGrantAdminRole(role: MaybeRole): boolean {
  return role === "Admin";
}

/**
 * Whether the actor may set the given role on another user.
 * Managers and HR can never create or promote someone to Admin.
 */
export function canSetRole(actorRole: MaybeRole, newRole: UserRole): boolean {
  if (!canManageUsers(actorRole)) return false;
  if (newRole === "Admin") return canGrantAdminRole(actorRole);
  return true;
}

/** Add, edit and delete holidays. */
export function canManageHolidays(role: MaybeRole): boolean {
  return hasAnyRole(role, HR_AND_ADMIN);
}

/** Change the weekend setting. */
export function canManageWeekendDays(role: MaybeRole): boolean {
  return hasAnyRole(role, HR_AND_ADMIN);
}

/** Mark leave for someone else. */
export function canMarkLeaveForOthers(role: MaybeRole): boolean {
  return hasAnyRole(role, APPROVERS);
}

/** Open the audit log. */
export function canViewAuditLog(role: MaybeRole): boolean {
  return role === "Admin";
}

/** Change departments and the reminder time. */
export function canManageSettings(role: MaybeRole): boolean {
  return role === "Admin";
}

/** See the "Not submitted today" list. */
export function canViewNotSubmittedList(role: MaybeRole): boolean {
  return hasAnyRole(role, APPROVERS);
}
