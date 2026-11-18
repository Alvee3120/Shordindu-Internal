import { ReactionKind } from "@prisma/client";

export const REACTION_KINDS = [
  ReactionKind.like,
  ReactionKind.dislike,
] as const;

export type ReactionKindValue = (typeof REACTION_KINDS)[number];

export const REACTION_LABELS: Record<ReactionKindValue, string> = {
  like: "Like",
  dislike: "Dislike",
};

export function isReactionKind(value: string): value is ReactionKindValue {
  return (REACTION_KINDS as readonly string[]).includes(value);
}
