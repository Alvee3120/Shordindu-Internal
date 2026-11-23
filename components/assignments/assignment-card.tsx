"use client";

import { useState } from "react";
import { Pencil, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCard } from "@/components/ui/user-card";
import { RichTextContent } from "@/components/editor/rich-text-content";
import { UpdateInteractions } from "@/components/interactions/update-interactions";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { callApi, callApiJson } from "@/components/api-client";
import { useToast } from "@/components/ui/toast";
import { formatDhakaDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  AssignmentAssigneeDto,
  AssignmentDto,
  PersonOptionDto,
} from "@/components/assignments/types";

const assigneeStatusLabels = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
} as const;

const assigneeBadgeVariants = {
  pending: "pending",
  in_progress: "onLeave",
  done: "active",
} as const;

function AssigneeRow({
  assignment,
  assignee,
  onChanged,
}: {
  assignment: AssignmentDto;
  assignee: AssignmentAssigneeDto;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [doneOpen, setDoneOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function update(
    status: "pending" | "in_progress" | "done",
    withNote?: string
  ) {
    setPending(true);
    const result = await callApiJson<{ assignment: AssignmentDto }>(
      `/api/assignments/${assignment.id}/status`,
      "POST",
      { status, note: status === "done" ? (withNote ?? "") : undefined }
    );
    setPending(false);

    if (!result.ok) {
      toast.show(result.error ?? "Could not update the status.", "error");
      return;
    }

    setDoneOpen(false);
    setNote("");
    toast.show("Status updated.", "success");
    onChanged();
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <UserCard
          name={assignee.name}
          position={assignee.position}
          department={assignee.department}
          avatarFile={assignee.avatarFile}
          size="sm"
          className="min-w-0 flex-1"
        />
        <Badge variant={assigneeBadgeVariants[assignee.status]}>
          {assigneeStatusLabels[assignee.status]}
        </Badge>
      </div>

      {assignee.status === "done" && assignee.doneNote ? (
        <p className="text-xs text-muted-foreground">
          Note: {assignee.doneNote}
        </p>
      ) : null}

      {assignee.isViewer && assignment.canUpdateOwnStatus ? (
        <div className="flex flex-wrap gap-1">
          {(["pending", "in_progress"] as const).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={assignee.status === status ? "secondary" : "outline"}
              className="h-8 px-2 text-xs"
              onClick={() => void update(status)}
              disabled={pending}
            >
              {assigneeStatusLabels[status]}
            </Button>
          ))}
          <Button
            size="sm"
            variant={assignee.status === "done" ? "secondary" : "outline"}
            className="h-8 px-2 text-xs"
            onClick={() => setDoneOpen((value) => !value)}
            disabled={pending}
          >
            Done
          </Button>
        </div>
      ) : null}

      {doneOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note"
            maxLength={500}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
          />
          <Button
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => void update("done", note)}
            disabled={pending}
          >
            Mark done
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setDoneOpen(false);
              setNote("");
            }}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AssignmentCard({
  assignment,
  people,
  departments,
  onChanged,
}: {
  assignment: AssignmentDto;
  people: PersonOptionDto[];
  departments: string[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function cancelAssignment() {
    if (!window.confirm("Cancel this assignment? The record is kept.")) return;
    setPending(true);
    const result = await callApi(
      `/api/assignments/${assignment.id}/cancel`,
      "POST"
    );
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Could not cancel the assignment.", "error");
      return;
    }
    toast.show("Assignment cancelled.", "success");
    onChanged();
  }

  async function removeAssignment() {
    if (!window.confirm("Delete this assignment? It is removed for everyone."))
      return;
    setPending(true);
    const result = await callApi(`/api/assignments/${assignment.id}`, "DELETE");
    setPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Could not delete the assignment.", "error");
      return;
    }
    toast.show("Assignment deleted.", "success");
    onChanged();
  }

  return (
    <article
      id={`assignment-${assignment.id}`}
      className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <UserCard
          name={assignment.creator.name}
          position={assignment.creator.position}
          department={assignment.creator.department}
          avatarFile={assignment.creator.avatarFile}
          size="sm"
        />
        <div className="text-right text-xs text-muted-foreground">
          <p>{formatDhakaDate(assignment.createdAt)}</p>
          <p>
            {assignment.dueDate
              ? `Due ${formatDhakaDate(assignment.dueDate)}`
              : "No due date"}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {assignment.priority === "urgent" ? (
          <Badge variant="urgent">Urgent</Badge>
        ) : null}
        {assignment.overdue ? <Badge variant="overdue">Overdue</Badge> : null}
        {assignment.editedAt ? <Badge variant="edited">Edited</Badge> : null}
        {assignment.status === "completed" ? (
          <Badge variant="active">Completed</Badge>
        ) : null}
        {assignment.status === "cancelled" ? (
          <Badge variant="disabled">Cancelled</Badge>
        ) : null}
        <Badge variant="neutral">
          {assignment.progress.done} of {assignment.progress.total} done
        </Badge>
      </div>

      <RichTextContent html={assignment.contentHtml} />

      <div className="space-y-2">
        <p className="text-sm font-medium">Assignees</p>
        {assignment.assignees.map((assignee) => (
          <AssigneeRow
            key={assignee.userId}
            assignment={assignment}
            assignee={assignee}
            onChanged={onChanged}
          />
        ))}
      </div>

      {editing ? (
        <AssignmentForm
          people={people}
          departments={departments}
          initial={assignment}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : assignment.canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            disabled={pending || assignment.status === "cancelled"}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void cancelAssignment()}
            disabled={pending || assignment.status === "cancelled"}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </Button>
          {assignment.canDelete ? (
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "text-destructive hover:bg-destructive/10 hover:text-destructive"
              )}
              onClick={() => void removeAssignment()}
              disabled={pending}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}

      <UpdateInteractions targetType="assignment" targetId={assignment.id} />
    </article>
  );
}
