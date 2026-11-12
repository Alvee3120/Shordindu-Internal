/**
 * Authentication & Session helper placeholders.
 * Fully implemented in Module 2.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "HR" | "Manager" | "Employee" | null;
  status: "Pending" | "Active" | "Rejected" | "Disabled";
  department: string;
  position: string;
}

export const SESSION_COOKIE_NAME = "shordindu_session";
