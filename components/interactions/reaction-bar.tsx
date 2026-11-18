"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { callApiJson } from "@/components/api-client";
import { useSessionUser } from "@/components/providers/session-provider";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type {
  ReactionKindDto,
  ReactionSummaryDto,
} from "@/components/interactions/types";

const OPTIONS: {
  kind: ReactionKindDto;
  label: string;
  icon: typeof ThumbsUp;
}[] = [
  { kind: "like", label: "Like", icon: ThumbsUp },
  { kind: "dislike", label: "Dislike", icon: ThumbsDown },
];

export function ReactionBar({
  targetType,
  targetId,
  initialReactions,
  className,
}: {
  targetType: "update" | "comment" | "assignment";
  targetId: string;
  initialReactions: ReactionSummaryDto[];
  className?: string;
}) {
  const user = useSessionUser();
  const toast = useToast();
  const [reactions, setReactions] =
    useState<ReactionSummaryDto[]>(initialReactions);
  const [pending, setPending] = useState<ReactionKindDto | null>(null);

  useEffect(() => {
    setReactions(initialReactions);
  }, [initialReactions]);

  const myReaction = reactions.find((item) => item.reactedByMe)?.kind ?? null;

  /**
   * Mirrors the server rule: picking the reaction you already have clears it,
   * picking the other one moves it, so only one can ever be active.
   */
  function optimistic(kind: ReactionKindDto): ReactionSummaryDto[] {
    const next = reactions.map((item) => {
      const users = item.users.filter((entry) => entry.id !== user.id);
      return {
        ...item,
        users,
        count: users.length,
        reactedByMe: false,
      };
    });

    if (myReaction === kind) {
      return next.filter((item) => item.count > 0);
    }

    const target = next.find((item) => item.kind === kind);
    if (target) {
      target.users = [...target.users, { id: user.id, name: user.name }];
      target.count = target.users.length;
      target.reactedByMe = true;
    } else {
      next.push({
        kind,
        count: 1,
        users: [{ id: user.id, name: user.name }],
        reactedByMe: true,
      });
    }

    return next.sort(
      (a, b) => (a.kind === "like" ? -1 : 1) - (b.kind === "like" ? -1 : 1)
    );
  }

  async function choose(kind: ReactionKindDto) {
    if (pending) return;

    const previous = reactions;
    const detail = callApiJson<{ reactions: ReactionSummaryDto[] }>(
      "/api/reactions",
      "POST",
      { targetType, targetId, kind }
    );

    setPending(kind);
    setReactions(optimistic(kind));

    const result = await detail;
    setPending(null);

    if (!result.ok || !result.data) {
      setReactions(previous);
      toast.show(result.error ?? "Could not save that reaction.", "error");
      return;
    }

    setReactions(result.data.reactions);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {OPTIONS.map(({ kind, label, icon: Icon }) => {
        const summary = reactions.find((item) => item.kind === kind);
        const count = summary?.count ?? 0;
        const mine = myReaction === kind;
        const names = summary?.users.map((entry) => entry.name) ?? [];
        const tooltip = names.length > 0 ? names.join(", ") : `${label} this`;

        return (
          <button
            key={kind}
            type="button"
            onClick={() => void choose(kind)}
            aria-pressed={mine}
            aria-label={label}
            title={tooltip}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition",
              mine
                ? kind === "like"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-card text-muted-foreground hover:border-input hover:bg-muted hover:text-foreground",
              pending === kind && "opacity-60"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {count > 0 ? <span>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
