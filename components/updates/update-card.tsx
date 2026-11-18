"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCard } from "@/components/ui/user-card";
import { RichTextContent } from "@/components/editor/rich-text-content";
import { UpdateInteractions } from "@/components/interactions/update-interactions";
import { formatDhakaDate, formatDhakaTime } from "@/lib/time";
import type { AuthorDto, UpdateDto } from "@/components/updates/types";

export function UpdateCard({
  author,
  update,
  onEdit,
  onDelete,
  busy = false,
  highlightHtml = null,
  showLockBadge = true,
}: {
  author: AuthorDto;
  update: UpdateDto;
  onEdit?: (update: UpdateDto) => void;
  onDelete?: (update: UpdateDto) => void;
  busy?: boolean;
  highlightHtml?: string | null;
  showLockBadge?: boolean;
}) {
  const showActions = update.canEdit && (onEdit || onDelete);

  return (
    <article
      id={`update-${update.id}`}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <header className="flex items-start justify-between gap-3">
        <UserCard
          name={author.name}
          position={author.position}
          department={author.department}
          size="sm"
        />
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <p>{formatDhakaDate(update.updateDate)}</p>
          <p>{formatDhakaTime(update.postedAt)}</p>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {update.isLate ? <Badge variant="late">Late</Badge> : null}
        {update.editedAt ? <Badge variant="edited">Edited</Badge> : null}
        {showLockBadge && !update.canEdit ? (
          <Badge variant="neutral">Locked</Badge>
        ) : null}
      </div>

      {highlightHtml ? (
        <div
          className="rich-text mt-3 text-sm leading-relaxed [&_mark]:rounded-sm [&_mark]:bg-gold/55 [&_mark]:px-0.5 [&_mark]:text-foreground"
          dangerouslySetInnerHTML={{ __html: highlightHtml }}
        />
      ) : (
        <RichTextContent html={update.contentHtml} className="mt-3" />
      )}

      {showActions ? (
        <footer className="mt-3 flex gap-2 border-t border-border pt-3">
          {onEdit ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(update)}
              disabled={busy}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(update)}
              disabled={busy}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
        </footer>
      ) : null}

      <UpdateInteractions targetType="update" targetId={update.id} />
    </article>
  );
}
