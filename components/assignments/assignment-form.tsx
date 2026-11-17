"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/auth/field";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { useToast } from "@/components/ui/toast";
import { callApiJson } from "@/components/api-client";
import type {
  AssignmentDto,
  PersonOptionDto,
} from "@/components/assignments/types";

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

export function AssignmentForm({
  people,
  departments,
  initial,
  onSaved,
  onCancel,
}: {
  people: PersonOptionDto[];
  departments: string[];
  initial?: AssignmentDto;
  onSaved: (assignment: AssignmentDto) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [content, setContent] = useState(initial?.contentHtml ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial ? initial.assignees.map((assignee) => assignee.userId) : [],
  );
  const [department, setDepartment] = useState("");
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ? initial.dueDate.slice(0, 10) : "",
  );
  const [priority, setPriority] = useState<"normal" | "urgent">(
    initial?.priority ?? "normal",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialIds = initial
    ? initial.assignees.map((assignee) => assignee.userId)
    : [];

  function toggleAssignee(userId: string) {
    setSelectedIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId],
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!hasText(content)) {
      setError("Write the instruction before saving.");
      return;
    }
    if (selectedIds.length === 0 && !department) {
      setError("Choose at least one assignee or a department.");
      return;
    }

    setSaving(true);
    const payload = initial
      ? {
          contentHtml: content,
          dueDate: dueDate || null,
          priority,
          addAssigneeIds: selectedIds.filter((id) => !initialIds.includes(id)),
          removeAssigneeIds: initialIds.filter(
            (id) => !selectedIds.includes(id),
          ),
        }
      : {
          contentHtml: content,
          assigneeIds: selectedIds,
          department: department || undefined,
          dueDate: dueDate || null,
          priority,
        };

    const result = await callApiJson<{ assignment: AssignmentDto }>(
      initial ? `/api/assignments/${initial.id}` : "/api/assignments",
      initial ? "PATCH" : "POST",
      payload,
    );
    setSaving(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not save the assignment.");
      return;
    }

    toast.show(
      initial ? "Assignment updated." : "Assignment created.",
      "success",
    );
    onSaved(result.data.assignment);

    if (!initial) {
      setContent("");
      setSelectedIds([]);
      setDepartment("");
      setDueDate("");
      setPriority("normal");
    }
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      onSubmit={submit}
    >
      <RichTextEditor
        value={content}
        onChange={setContent}
        placeholder="Write the instruction, type @ to mention someone"
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">Assignees</p>
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
          {people.map((person) => (
            <label
              key={person.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selectedIds.includes(person.id)}
                onChange={() => toggleAssignee(person.id)}
                disabled={saving}
              />
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
              <span className="text-xs text-muted-foreground">
                {person.department}
              </span>
            </label>
          ))}
        </div>
        {people.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active users.</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="assignment-department" className="text-sm font-medium">
            Add a whole department
          </label>
          <select
            id="assignment-department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className={inputClass}
            disabled={saving}
          >
            <option value="">No department</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <Field
          id="assignment-due"
          label="Due date (optional)"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          disabled={saving}
        />

        <div className="space-y-1.5">
          <label htmlFor="assignment-priority" className="text-sm font-medium">
            Priority
          </label>
          <select
            id="assignment-priority"
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as "normal" | "urgent")
            }
            className={inputClass}
            disabled={saving}
          >
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !hasText(content)}>
          {saving
            ? "Saving..."
            : initial
              ? "Save changes"
              : "Create assignment"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
