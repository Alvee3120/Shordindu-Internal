"use client";

import { useState } from "react";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RichTextContent } from "@/components/editor/rich-text-content";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { useToast } from "@/components/ui/toast";
import { callApi } from "@/components/api-client";
import { formatDhakaDate, formatDhakaTime } from "@/lib/time";
import type { AnnouncementDto } from "@/components/announcements/types";

export function AnnouncementCard({
  announcement,
  onChanged,
}: {
  announcement: AnnouncementDto;
  onChanged: (announcement: AnnouncementDto | null) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        "Delete this announcement? It disappears from the list for everyone."
      )
    ) {
      return;
    }

    setDeleting(true);
    const result = await callApi(`/api/announcements/${announcement.id}`, "DELETE");
    setDeleting(false);

    if (!result.ok) {
      toast.show(result.error ?? "Could not delete the announcement.", "error");
      return;
    }

    toast.show("Announcement deleted.", "success");
    onChanged(null);
  }

  if (editing) {
    return (
      <AnnouncementForm
        initial={announcement}
        onSaved={(saved) => {
          setEditing(false);
          onChanged(saved);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card id={`announcement-${announcement.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{announcement.title}</h2>
            {announcement.editedAt ? <Badge variant="edited">Edited</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {announcement.author.name}
            {announcement.author.position
              ? ` · ${announcement.author.position}`
              : ""}
            {" · "}
            {formatDhakaDate(announcement.createdAt)} at{" "}
            {formatDhakaTime(announcement.createdAt)}
          </p>
        </div>

        {announcement.canEdit ? (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={deleting}
              aria-label="Edit announcement"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={remove}
              disabled={deleting}
              aria-label="Delete announcement"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="pt-3">
        <RichTextContent html={announcement.contentHtml} />
      </CardContent>
    </Card>
  );
}
