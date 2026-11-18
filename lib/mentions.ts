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
 * Plain-text comments mark people as `@[Name](id)`. Names may contain spaces,
 * so the id is what identifies the person.
 */
const MENTION_TOKEN = /@\[([^\]|]+)\]\(([0-9a-zA-Z-]+)\)/g;

export function extractMentionIdsFromText(text: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_TOKEN.lastIndex = 0;

  while ((match = MENTION_TOKEN.exec(text)) !== null) {
    const id = match[2];
    if (id) ids.add(id);
  }

  return Array.from(ids);
}

/** Removes the id from mention tokens, leaving `@Name` for display. */
export function stripMentionTokens(text: string): string {
  return text.replace(MENTION_TOKEN, "@$1");
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turns what the writer sees (`@Md Fazlah Karim Alvee`) into the stored token
 * for every name that belongs to a real person. Hand-typed names count too, so
 * acknowledging someone by typing their name still notifies them. Unknown
 * names are left as plain text.
 */
export function toMentionTokens(
  text: string,
  users: { id: string; name: string }[]
): string {
  let result = text;

  // Longest names first, so "Md Fazlah Karim Alvee" wins over a shorter name.
  const byLength = [...users].sort((a, b) => b.name.length - a.name.length);

  for (const user of byLength) {
    if (!user.name.trim()) continue;
    const pattern = new RegExp(`@${escapeForRegExp(user.name)}(?![\\w])`, "gi");
    result = result.replace(pattern, `@[${user.name}](${user.id})`);
  }

  return result;
}

/** Same as toMentionTokens, resolving names against the Active user list. */
export async function toMentionTokensForActiveUsers(
  client: Prisma.TransactionClient,
  text: string
): Promise<string> {
  const users = await client.user.findMany({
    where: { status: UserStatus.Active },
    select: { id: true, name: true },
  });
  return toMentionTokens(text, users);
}

/**
 * Returns the saved mention tokens whose user is still Active, so a stale or
 * hand-typed id can never create a mention row.
 */
export async function activeMentionIdsFromText(
  client: Prisma.TransactionClient,
  text: string
): Promise<{ id: string; name: string }[]> {
  const ids = extractMentionIdsFromText(text);
  if (ids.length === 0) return [];

  return client.user.findMany({
    where: { id: { in: ids }, status: UserStatus.Active },
    select: { id: true, name: true },
  });
}

/**
 * Replaces the mentions stored for a target with the ones present in the HTML.
 * Only Active users are stored, so a stale or fake id is ignored.
 */
export async function replaceMentions(
  tx: Prisma.TransactionClient,
  targetType: TargetType,
  targetId: string,
  html: string
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

/** Same as replaceMentions, for plain-text comment content. */
export async function replaceMentionTokens(
  tx: Prisma.TransactionClient,
  targetType: TargetType,
  targetId: string,
  text: string
): Promise<void> {
  await tx.mention.deleteMany({ where: { targetType, targetId } });

  const users = await activeMentionIdsFromText(tx, text);
  if (users.length === 0) return;

  await tx.mention.createMany({
    data: users.map((user) => ({
      targetType,
      targetId,
      mentionedUserId: user.id,
    })),
  });
}
