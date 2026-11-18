"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { UpdateCard } from "@/components/updates/update-card";
import { callApi, fetchJson } from "@/components/api-client";
import { formatDhakaDate } from "@/lib/time";
import type { AuthorDto, UpdateDto } from "@/components/updates/types";

export function MyUpdates({
  author,
  today,
}: {
  author: AuthorDto;
  today: string;
}) {
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [content, setContent] = useState("");
  const [existing, setExisting] = useState<UpdateDto | null>(null);
  const [updates, setUpdates] = useState<UpdateDto[]>([]);
  const [loadingDate, setLoadingDate] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const result = await fetchJson<{ updates: UpdateDto[] }>(
      "/api/updates/mine"
    );
    setLoadingList(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load your updates.");
      return;
    }
    setUpdates(result.data.updates);
  }, []);

  const loadDate = useCallback(async (dateValue: string) => {
    if (!dateValue) return;
    setLoadingDate(true);
    const result = await fetchJson<{ update: UpdateDto | null }>(
      `/api/updates?date=${encodeURIComponent(dateValue)}`
    );
    setLoadingDate(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load that date.");
      return;
    }
    setExisting(result.data.update);
    setContent(result.data.update?.contentHtml ?? "");
  }, []);

  useEffect(() => {
    void loadList();
    void loadDate(today);
  }, [loadList, loadDate, today]);

  useEffect(() => {
    if (!editorOpen) return;
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editorOpen]);

  const locked = existing !== null && !existing.canEdit;

  /** Closes the editor and returns to today, discarding unsaved text. */
  const closeEditor = useCallback(async () => {
    setEditorOpen(false);
    setError(null);
    setDate(today);
    await loadDate(today);
  }, [today, loadDate]);

  function openEditor() {
    setError(null);
    setEditorOpen(true);
  }

  async function save() {
    if (locked || !date) return;
    setSaving(true);
    setError(null);

    const result = existing
      ? await callApi(`/api/updates/${existing.id}`, "PATCH", {
          contentHtml: content,
        })
      : await callApi("/api/updates", "POST", {
          updateDate: date,
          contentHtml: content,
        });

    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save your update.");
      return;
    }

    toast.show(result.message ?? "Update saved.", "success");
    await loadList();
    await closeEditor();
  }

  async function remove(update: UpdateDto) {
    if (!window.confirm("Delete this update? This cannot be undone.")) return;

    setDeletingId(update.id);
    setError(null);
    const result = await callApi(`/api/updates/${update.id}`, "DELETE");
    setDeletingId(null);

    if (!result.ok) {
      setError(result.error ?? "Could not delete the update.");
      return;
    }

    toast.show(result.message ?? "Update deleted.", "success");
    await loadList();
    await closeEditor();
  }

  function editFromList(update: UpdateDto) {
    setDate(update.updateDate.slice(0, 10));
    setExisting(update);
    setContent(update.contentHtml);
    setError(null);
    setEditorOpen(true);
  }

  function changeDate(next: string) {
    setDate(next);
    setError(null);
    void loadDate(next);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">My Updates</h1>
          <p className="text-sm text-muted-foreground">
            Post what you worked on. You can edit or delete it until midnight
            Dhaka time.
          </p>
        </div>

        {!editorOpen && !locked ? (
          <Button onClick={openEditor} disabled={loadingDate}>
            <Plus className="mr-1.5 h-4 w-4" />
            {existing ? "Edit today's update" : "Create update"}
          </Button>
        ) : null}
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {locked && existing && !editorOpen ? (
        <Card>
          <CardContent className="flex items-start gap-2 pt-4 text-sm sm:pt-5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              Today&apos;s update is locked. It was posted on{" "}
              {formatDhakaDate(existing.postedAt)} and can only be edited on
              that day.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {editorOpen ? (
        <div ref={editorRef}>
          <Card>
            <CardContent className="space-y-4 pt-4 sm:pt-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="update-date" className="text-sm font-medium">
                    Update date
                  </label>
                  <input
                    id="update-date"
                    type="date"
                    value={date}
                    max={today}
                    onChange={(event) => changeDate(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {loadingDate
                    ? "Checking this date..."
                    : existing
                      ? locked
                        ? "Posted earlier - locked"
                        : "Editing your update"
                      : "New update"}
                </p>
              </div>

              {locked && existing ? (
                <p className="flex items-start gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold-foreground">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  This update is locked. It was posted on{" "}
                  {formatDhakaDate(existing.postedAt)} and can only be edited on
                  that day.
                </p>
              ) : null}

              <RichTextEditor
                value={content}
                onChange={setContent}
                editable={!locked && !loadingDate}
                placeholder="What did you work on?"
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void save()}
                  disabled={saving || locked || loadingDate || !date}
                >
                  {saving
                    ? "Saving..."
                    : existing
                      ? "Save changes"
                      : "Post update"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void closeEditor()}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <p className="text-xs text-muted-foreground">
                  One update per day.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent updates</h2>

        {loadingList && updates.length === 0
          ? Array.from({ length: 2 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          : null}

        {!loadingList && updates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No updates yet"
            description="Use the Create update button to post your first one."
          />
        ) : null}

        {updates.map((update) => (
          <UpdateCard
            key={update.id}
            author={author}
            update={update}
            onEdit={update.canEdit ? editFromList : undefined}
            onDelete={update.canEdit ? remove : undefined}
            busy={deletingId === update.id}
          />
        ))}
      </section>
    </div>
  );
}
