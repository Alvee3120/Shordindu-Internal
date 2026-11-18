"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/auth/field";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { AssigneePicker } from "@/components/assignments/assignee-picker";
import { useToast } from "@/components/ui/toast";
import { callApiJson } from "@/components/api-client";
import type {
  AssignmentDto,
  PersonOptionDto,
} from "@/components/assignments/types";

function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
    initial ? initial.assignees.map((assignee) => assignee.userId) : []
  );
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ? initial.dueDate.slice(0, 10) : ""
  );
  const [priority, setPriority] = useState<"normal" | "urgent">(
    initial?.priority ?? "normal"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialIds = initial
    ? initial.assignees.map((assignee) => assignee.userId)
    : [];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!hasText(content)) {
      setError("Write the instruction before saving.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Choose at least one assignee.");
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
            (id) => !selectedIds.includes(id)
          ),
        }
      : {
          contentHtml: content,
          assigneeIds: selectedIds,
          dueDate: dueDate || null,
          priority,
        };

    const result = await callApiJson<{ assignment: AssignmentDto }>(
      initial ? `/api/assignments/${initial.id}` : "/api/assignments",
      initial ? "PATCH" : "POST",
      payload
    );
    setSaving(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not save the assignment.");
      return;
    }

    toast.show(
      initial ? "Assignment updated." : "Assignment created.",
      "success"
    );
    onSaved(result.data.assignment);

    if (!initial) {
      setContent("");
      setSelectedIds([]);
      setDueDate("");
      setPriority("normal");
    }
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      onSubmit={submit}
    >
      <RichTextEditor
        value={content}
        onChange={setContent}
        placeholder="Write the instruction, type @ to mention someone"
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">Assignees</p>
        <AssigneePicker
          people={people}
          departments={departments}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          disabled={saving}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
