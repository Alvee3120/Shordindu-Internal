"use client";

import { useState } from "react";
import { Pencil, Reply, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommentInput } from "@/components/interactions/comment-input";
import { CommentText } from "@/components/interactions/comment-text";
import { cn } from "@/lib/utils";
import { formatDhakaTime } from "@/lib/time";
import type { ChatMessageDto } from "@/components/chat/types";

export function ChatMessage({
  message,
  isMine,
  onEdit,
  onDelete,
  onReply,
}: {
  message: ChatMessageDto;
  isMine: boolean;
  onEdit: (id: string, content: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
  onReply: (message: ChatMessageDto) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;

    setBusy(true);
    const failure = await onEdit(message.id, draft);
    setBusy(false);

    if (failure) {
      setError(failure);
      return;
    }
    setError(null);
    setEditing(false);
  }

  async function remove() {
    if (!window.confirm("Delete this message?")) return;

    setBusy(true);
    const failure = await onDelete(message.id);
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group flex gap-3 rounded-lg px-2 py-1.5",
        isMine ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar
        name={message.author.name}
        avatarFile={message.author.avatarFile}
        size="sm"
      />

      <div
        className={cn("min-w-0 max-w-[85%] space-y-1", isMine && "items-end")}
      >
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-2 text-xs",
            isMine && "justify-end"
          )}
        >
          <span className="font-medium">{message.author.name}</span>
          <span className="text-muted-foreground">
            {formatDhakaTime(message.createdAt)}
          </span>
          {message.editedAt ? <Badge variant="edited">Edited</Badge> : null}
        </div>

        {editing ? (
          <form onSubmit={save} className="space-y-2">
            <CommentInput
              value={draft}
              onChange={setDraft}
              placeholder="Edit your message"
              rows={2}
              disabled={busy}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
                {busy ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.content);
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div
            className={cn(
              "rounded-2xl px-3 py-2",
              isMine
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
              isMine && "[&_.mention]:text-primary-foreground"
            )}
          >
            {message.replyTo ? (
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(`message-${message.replyTo?.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                className={cn(
                  "mb-1.5 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs",
                  isMine
                    ? "border-primary-foreground/60 bg-black/10"
                    : "border-primary bg-background/70"
                )}
              >
                <span className="block font-semibold">
                  {message.replyTo.author.name}
                </span>
                <span
                  className={cn(
                    "line-clamp-2 break-words opacity-80",
                    message.replyTo.deleted && "italic"
                  )}
                >
                  {message.replyTo.deleted
                    ? "Message deleted"
                    : message.replyTo.content}
                </span>
              </button>
            ) : null}
            <CommentText content={message.content} />
          </div>
        )}

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {!editing ? (
        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onReply(message)}
            disabled={busy}
            aria-label="Reply to message"
          >
            <Reply className="h-3.5 w-3.5" />
          </Button>
          {message.canEdit ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setEditing(true)}
                disabled={busy}
                aria-label="Edit message"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={remove}
                disabled={busy}
                aria-label="Delete message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
