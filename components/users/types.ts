export type ManagedRole = "Admin" | "HR" | "Manager" | "Employee";

export type ManagedStatus =
  "Pending" | "Active" | "Rejected" | "Disabled" | "Deleted";

export interface PendingUserDto {
  id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  createdAt: string;
}

export interface ManagedUserDto extends PendingUserDto {
  role: ManagedRole | null;
  status: ManagedStatus;
  onLeaveToday?: boolean;
}
