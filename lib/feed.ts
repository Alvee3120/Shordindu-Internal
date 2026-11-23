import { Prisma, UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Feed queries use raw SQL because search needs PostgreSQL full-text matching
 * and ts_headline snippets, which Prisma cannot express.
 * All user input is bound as a parameter, never interpolated.
 */

export interface FeedFilters {
  from?: string;
  to?: string;
  userId?: string;
  department?: string;
  q?: string;
}

export interface FeedItem {
  id: string;
  author: {
    id: string;
    name: string;
    position: string;
    department: string;
    avatarFile: string | null;
  };
  updateDate: string;
  postedAt: string;
  isLate: boolean;
  editedAt: string | null;
  contentHtml: string;
  headline: string | null;
}

export interface PersonOption {
  id: string;
  name: string;
  department: string;
  position: string;
  avatarFile: string | null;
}

const cursorSchema = z.object({
  d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  p: z.string().datetime(),
  i: z.string().uuid(),
});

export type FeedCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): FeedCursor | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * ts_headline returns user text with our <mark> markers. Escape everything,
 * then re-enable only the markers so the snippet is safe to inject.
 */
function safeHeadline(text: string | null): string | null {
  if (!text) return null;
  return escapeHtml(text)
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

interface FeedRow {
  id: string;
  userId: string;
  authorName: string;
  authorPosition: string;
  authorDepartment: string;
  authorAvatarFile: string | null;
  updateDate: Date;
  postedAt: Date;
  isLate: boolean;
  editedAt: Date | null;
  contentHtml: string;
  headline: string | null;
}

function toItem(row: FeedRow): FeedItem {
  return {
    id: row.id,
    author: {
      id: row.userId,
      name: row.authorName,
      position: row.authorPosition,
      department: row.authorDepartment,
      avatarFile: row.authorAvatarFile,
    },
    updateDate: row.updateDate.toISOString().slice(0, 10),
    postedAt: row.postedAt.toISOString(),
    isLate: row.isLate,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    contentHtml: row.contentHtml,
    headline: safeHeadline(row.headline),
  };
}

export async function getFeed(
  filters: FeedFilters,
  cursor: FeedCursor | null = null,
  limit = 10
): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const conditions: Prisma.Sql[] = [Prisma.sql`w.deleted_at IS NULL`];

  if (filters.from) {
    conditions.push(Prisma.sql`w.update_date >= ${filters.from}::date`);
  }
  if (filters.to) {
    conditions.push(Prisma.sql`w.update_date <= ${filters.to}::date`);
  }
  if (filters.userId) {
    conditions.push(Prisma.sql`w.user_id = ${filters.userId}`);
  }
  if (filters.department) {
    conditions.push(Prisma.sql`u.department = ${filters.department}`);
  }
  if (filters.q) {
    conditions.push(Prisma.sql`(
      to_tsvector('english', w.content_text) @@ websearch_to_tsquery('english', ${filters.q})
      OR u.name ILIKE ${`%${filters.q}%`}
    )`);
  }
  if (cursor) {
    conditions.push(Prisma.sql`(
      w.update_date < ${cursor.d}::date
      OR (
        w.update_date = ${cursor.d}::date
        AND w.posted_at < ${cursor.p}::timestamp
      )
      OR (
        w.update_date = ${cursor.d}::date
        AND w.posted_at = ${cursor.p}::timestamp
        AND w.id < ${cursor.i}
      )
    )`);
  }

  const headlineSql = filters.q
    ? Prisma.sql`ts_headline(
        'english',
        w.content_text,
        websearch_to_tsquery('english', ${filters.q}),
        'StartSel=<mark>,StopSel=</mark>,MaxWords=35,MinWords=15,MaxFragments=1'
      )`
    : Prisma.sql`NULL::text`;

  const rows = await prisma.$queryRaw<FeedRow[]>(Prisma.sql`
    SELECT
      w.id,
      w.user_id AS "userId",
      u.name AS "authorName",
      u.position AS "authorPosition",
      u.department AS "authorDepartment",
      u.avatar_file AS "authorAvatarFile",
      w.update_date AS "updateDate",
      w.posted_at AS "postedAt",
      w.is_late AS "isLate",
      w.edited_at AS "editedAt",
      w.content_html AS "contentHtml",
      ${headlineSql} AS "headline"
    FROM updates w
    JOIN users u ON u.id = w.user_id
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY w.update_date DESC, w.posted_at DESC, w.id DESC
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    items: page.map(toItem),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            d: last.updateDate.toISOString().slice(0, 10),
            p: last.postedAt.toISOString(),
            i: last.id,
          })
        : null,
  };
}

/** Active users for the person filter. */
export async function listActivePeople(): Promise<PersonOption[]> {
  return prisma.user.findMany({
    where: { status: UserStatus.Active },
    select: {
      id: true,
      name: true,
      department: true,
      position: true,
      avatarFile: true,
    },
    orderBy: { name: "asc" },
  });
}
