"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/auth/field";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { useToast } from "@/components/ui/toast";
import { callApiJson } from "@/components/api-client";
import type { AnnouncementDto } from "@/components/announcements/types";

function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

export function AnnouncementForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: AnnouncementDto;
  onSaved: (announcement: AnnouncementDto) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.contentHtml ?? "");
  const [sendEmail, setSendEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (title.trim().length < 2) {
      setError("Enter a title.");
      return;
    }
    if (!hasText(content)) {
      setError("Write the announcement before saving.");
      return;
    }

    setSaving(true);
    const result = await callApiJson<{ announcement: AnnouncementDto }>(
      initial ? `/api/announcements/${initial.id}` : "/api/announcements",
      initial ? "PATCH" : "POST",
      {
        title: title.trim(),
        contentHtml: content,
        ...(initial ? {} : { sendEmail }),
      }
    );
    setSaving(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not save the announcement.");
      return;
    }

    toast.show(
      initial
        ? "Announcement updated."
        : sendEmail
          ? "Announcement posted and emailed."
          : "Announcement posted. It is visible in the app only.",
      "success"
    );
    onSaved(result.data.announcement);

    if (!initial) {
      setTitle("");
      setContent("");
      setSendEmail(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      onSubmit={submit}
    >
      <Field
        id="announcement-title"
        label="Title"
        value={title}
        maxLength={160}
        placeholder="For example: Office closed on Sunday"
        onChange={(event) => setTitle(event.target.value)}
        disabled={saving}
      />

      <RichTextEditor
        value={content}
        onChange={setContent}
        placeholder="Write the notice or information you want everyone to know"
      />

      {!initial ? (
        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(event) => setSendEmail(event.target.checked)}
            disabled={saving}
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <span className="font-medium">
            Also send this announcement by email
          </span>
        </label>
      ) : null}

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
              : "Post announcement"}
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
