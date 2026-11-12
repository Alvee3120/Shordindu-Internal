/**
 * Role-Based Permission Checkers.
 * Roles: Admin, HR, Manager, Employee.
 * Fully implemented and tested in Module 1.
 */

export type UserRole = "Admin" | "HR" | "Manager" | "Employee";

export function canGrantAdminRole(
  actorRole: UserRole | null | undefined
): boolean {
  return actorRole === "Admin";
}

export function canManageHolidays(
  actorRole: UserRole | null | undefined
): boolean {
  return actorRole === "Admin" || actorRole === "HR";
}

export function canMarkLeaveForOthers(
  actorRole: UserRole | null | undefined
): boolean {
  return actorRole === "Admin" || actorRole === "HR" || actorRole === "Manager";
}

export function canViewAuditLog(
  actorRole: UserRole | null | undefined
): boolean {
  return actorRole === "Admin";
}
