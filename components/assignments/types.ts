export type AssignmentPriorityDto = "normal" | "urgent";
export type AssignmentStatusDto = "open" | "completed" | "cancelled";
export type AssigneeStatusDto = "pending" | "in_progress" | "done";

export interface AssignmentAssigneeDto {
  userId: string;
  name: string;
  position: string;
  department: string;
  status: AssigneeStatusDto;
  doneNote: string | null;
  doneAt: string | null;
  isViewer: boolean;
}

export interface AssignmentDto {
  id: string;
  contentHtml: string;
  dueDate: string | null;
  priority: AssignmentPriorityDto;
  status: AssignmentStatusDto;
  createdAt: string;
  editedAt: string | null;
  creator: {
    id: string;
    name: string;
    position: string;
    department: string;
  };
  assignees: AssignmentAssigneeDto[];
  progress: { done: number; total: number };
  overdue: boolean;
  canManage: boolean;
  canDelete: boolean;
  canUpdateOwnStatus: boolean;
}

export interface PersonOptionDto {
  id: string;
  name: string;
  department: string;
  position: string;
}
