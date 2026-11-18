"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCard } from "@/components/ui/user-card";
import { CommentInput } from "@/components/interactions/comment-input";
import { CommentText } from "@/components/interactions/comment-text";
import { ReactionBar } from "@/components/interactions/reaction-bar";
import { callApi, callApiJson, fetchJson } from "@/components/api-client";
import { useSessionUser } from "@/components/providers/session-provider";
import { useToast } from "@/components/ui/toast";
import { formatDhakaDate, formatDhakaTime } from "@/lib/time";
import { stripMentionTokens } from "@/lib/mentions";
import type { CommentDto } from "@/components/interactions/types";

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export function CommentSection({
  targetType,
  targetId,
  onCountChange,
}: {
  targetType: "update" | "assignment";
  targetId: string;
  onCountChange: (count: number) => void;
}) {
  const user = useSessionUser();
  const toast = useToast();
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{
      comments: CommentDto[];
      commentCount: number;
    }>(`/api/comments?targetType=${targetType}&targetId=${targetId}`);
    setLoading(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load comments.");
      return;
    }

    setComments(result.data.comments);
    onCountChange(result.data.commentCount);
  }, [targetType, targetId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!hasText(draft) || submitting) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: CommentDto = {
      id: tempId,
      author: {
        id: user.id,
        name: user.name,
        position: user.position,
        department: user.department,
      },
      content: draft,
      createdAt: new Date().toISOString(),
      editedAt: null,
      canEdit: true,
      reactions: [],
    };

    setComments((previous) => [...previous, optimistic]);
    setDraft("");
    setSubmitting(true);
    setError(null);

    const result = await callApiJson<{ comment: CommentDto }>(
      "/api/comments",
      "POST",
      { targetType, targetId, content: draft }
    );

    setSubmitting(false);

    if (!result.ok || !result.data) {
      setComments((previous) =>
        previous.filter((comment) => comment.id !== tempId)
      );
      toast.show(result.error ?? "Could not add the comment.", "error");
      return;
    }

    const saved = result.data.comment;
    setComments((previous) => {
      const next = previous.map((comment) =>
        comment.id === tempId ? saved : comment
      );
      onCountChange(next.length);
      return next;
    });
    toast.show("Comment added.", "success");
  }

  async function saveEdit(commentId: string) {
    if (!hasText(editDraft)) return;

    setBusyId(commentId);
    setError(null);
    const result = await callApiJson<{ comment: CommentDto }>(
      `/api/comments/${commentId}`,
      "PATCH",
      { content: editDraft }
    );
    setBusyId(null);

    if (!result.ok || !result.data) {
      toast.show(result.error ?? "Could not edit the comment.", "error");
      return;
    }

    const saved = result.data.comment;
    setComments((previous) =>
      previous.map((comment) => (comment.id === commentId ? saved : comment))
    );
    setEditingId(null);
    setEditDraft("");
    toast.show("Comment edited.", "success");
  }

  async function remove(commentId: string) {
    if (!window.confirm("Delete this comment?")) return;

    setBusyId(commentId);
    setError(null);
    const result = await callApi(`/api/comments/${commentId}`, "DELETE");
    setBusyId(null);

    if (!result.ok) {
      toast.show(result.error ?? "Could not delete the comment.", "error");
      return;
    }

    setComments((previous) => {
      const next = previous.filter((comment) => comment.id !== commentId);
      onCountChange(next.length);
      return next;
    });
    toast.show("Comment deleted.", "success");
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading comments...</p>
        ) : null}

        {!loading && comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet. Start the conversation.
          </p>
        ) : null}

        {comments.map((comment) => (
          <div
            key={comment.id}
            className={`space-y-2 border-t border-border pt-3 ${
              comment.id.startsWith("temp-") ? "opacity-70" : ""
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <UserCard
                name={comment.author.name}
                position={comment.author.position}
                department={comment.author.department}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">
                {formatDhakaDate(comment.createdAt)} &middot;{" "}
                {formatDhakaTime(comment.createdAt)}
              </span>
            </div>

            {comment.editedAt ? <Badge variant="edited">Edited</Badge> : null}

            {editingId === comment.id ? (
              <div className="space-y-2">
                <CommentInput
                  value={editDraft}
                  onChange={setEditDraft}
                  placeholder="Edit your comment"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void saveEdit(comment.id)}
                    disabled={busyId === comment.id || !hasText(editDraft)}
                  >
                    {busyId === comment.id ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft("");
                    }}
                    disabled={busyId === comment.id}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <CommentText content={comment.content} />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <ReactionBar
                targetType="comment"
                targetId={comment.id}
                initialReactions={comment.reactions}
              />

              {comment.canEdit && editingId !== comment.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditDraft(stripMentionTokens(comment.content));
                    }}
                    disabled={busyId === comment.id}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void remove(comment.id)}
                    disabled={busyId === comment.id}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <CommentInput
          value={draft}
          onChange={setDraft}
          placeholder="Write a comment, type @ to mention someone"
        />
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={submitting || !hasText(draft)}
        >
          {submitting ? "Posting..." : "Comment"}
        </Button>
      </div>
    </div>
  );
}
