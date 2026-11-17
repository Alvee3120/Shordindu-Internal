import { Prisma, TargetType, UserStatus } from "@prisma/client";

/** Reads mention user ids from sanitized rich text (`span[data-mention]`). */
export function extractMentionIds(html: string): string[] {
  const ids = new Set<string>();
  const pattern = /data-mention="([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const id = match[1];
    if (id) ids.add(id);
  }

  return Array.from(ids);
}

/**
 * Replaces the mentions stored for a target with the ones present in the HTML.
 * Only Active users are stored, so a stale or fake id is ignored.
 */
export async function replaceMentions(
  tx: Prisma.TransactionClient,
  targetType: TargetType,
  targetId: string,
  html: string,
): Promise<void> {
  await tx.mention.deleteMany({ where: { targetType, targetId } });

  const ids = extractMentionIds(html);
  if (ids.length === 0) return;

  const users = await tx.user.findMany({
    where: { id: { in: ids }, status: UserStatus.Active },
    select: { id: true },
  });
  if (users.length === 0) return;

  await tx.mention.createMany({
    data: users.map((user) => ({
      targetType,
      targetId,
      mentionedUserId: user.id,
    })),
  });
}
