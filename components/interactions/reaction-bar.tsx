"use client";

import { useEffect, useState } from "react";
import { REACTION_EMOJIS } from "@/lib/reaction-emojis";
import { callApiJson } from "@/components/api-client";
import { useSessionUser } from "@/components/providers/session-provider";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ReactionSummaryDto } from "@/components/interactions/types";

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
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    setReactions(initialReactions);
  }, [initialReactions]);

  function optimistic(emoji: string): ReactionSummaryDto[] {
    const map = new Map(reactions.map((item) => [item.emoji, item]));
    const existing = map.get(emoji);
    const users = existing?.users ?? [];
    const hasReacted = users.some((entry) => entry.id === user.id);
    const nextUsers = hasReacted
      ? users.filter((entry) => entry.id !== user.id)
      : [...users, { id: user.id, name: user.name }];

    if (nextUsers.length === 0) {
      map.delete(emoji);
    } else {
      map.set(emoji, {
        emoji,
        count: nextUsers.length,
        users: nextUsers,
        reactedByMe: !hasReacted,
      });
    }

    return REACTION_EMOJIS.map((item) => map.get(item)).filter(
      (item): item is ReactionSummaryDto => Boolean(item),
    );
  }

  async function toggle(emoji: string) {
    if (pending) return;

    const previous = reactions;
    setPending(emoji);
    setReactions(optimistic(emoji));

    const result = await callApiJson<{ reactions: ReactionSummaryDto[] }>(
      "/api/reactions",
      "POST",
      { targetType, targetId, emoji },
    );

    setPending(null);

    if (!result.ok || !result.data) {
      setReactions(previous);
      toast.show(result.error ?? "Could not save that reaction.", "error");
      return;
    }

    setReactions(result.data.reactions);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {REACTION_EMOJIS.map((emoji) => {
        const summary = reactions.find((item) => item.emoji === emoji);
        const count = summary?.count ?? 0;
        const mine = summary?.reactedByMe ?? false;
        const names = summary?.users.map((entry) => entry.name) ?? [];

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => void toggle(emoji)}
            aria-pressed={mine}
            aria-label={`React with ${emoji}`}
            title={names.length > 0 ? names.join(", ") : `React with ${emoji}`}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full border px-2 text-sm transition",
              mine
                ? "border-primary/40 bg-primary/10"
                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800",
              pending === emoji && "opacity-60",
            )}
          >
            <span>{emoji}</span>
            {count > 0 ? (
              <span className="text-xs text-muted-foreground">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
