"use client";

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { fetchJson } from "@/components/api-client";
import { ReactionBar } from "@/components/interactions/reaction-bar";
import { CommentSection } from "@/components/interactions/comment-section";
import type { ReactionSummaryDto } from "@/components/interactions/types";

export function UpdateInteractions({
  targetType,
  targetId,
}: {
  targetType: "update" | "assignment";
  targetId: string;
}) {
  const [reactions, setReactions] = useState<ReactionSummaryDto[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchJson<{
        reactions: ReactionSummaryDto[];
        commentCount: number;
      }>(`/api/interactions?targetType=${targetType}&targetId=${targetId}`);
      if (!cancelled && result.ok && result.data) {
        setReactions(result.data.reactions);
        setCommentCount(result.data.commentCount);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetType, targetId]);

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReactionBar
          targetType={targetType}
          targetId={targetId}
          initialReactions={reactions}
        />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4" />
          {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </button>
      </div>

      {open ? (
        <CommentSection
          targetType={targetType}
          targetId={targetId}
          onCountChange={setCommentCount}
        />
      ) : null}
    </div>
  );
}
