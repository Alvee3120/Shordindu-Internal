import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dhakaDayEndUtc, dhakaDayStartUtc } from "@/lib/time";

/**
 * Audit Log Helper.
 * Records who, what action, which item, before/after snapshots, and when.
 * Pass the transaction client when logging inside a transaction so the change
 * and its audit entry commit together.
 */

export interface AuditLogEntry {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}

type AuditWriter = Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient;

function toJsonValue(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

export async function logAudit(
  entry: AuditLogEntry,
  client: AuditWriter = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeJson: toJsonValue(entry.beforeJson),
      afterJson: toJsonValue(entry.afterJson),
    },
  });
}

export interface AuditFilters {
  /** User id, or "system" for entries without an actor. */
  actorId?: string;
  action?: string;
  /** Dhaka calendar date, YYYY-MM-DD. */
  from?: string;
  to?: string;
}

export interface AuditEntryView {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: Prisma.JsonValue | null;
  afterJson: Prisma.JsonValue | null;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
}

export interface AuditPage {
  entries: AuditEntryView[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  actions: string[];
  users: { id: string; name: string; email: string }[];
}

/** Paginated, filtered audit entries for the Admin page. */
export async function listAuditLog(
  filters: AuditFilters,
  page = 1,
  pageSize = 20,
): Promise<AuditPage> {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.actorId === "system") {
    where.actorId = null;
  } else if (filters.actorId) {
    where.actorId = filters.actorId;
  }
  if (filters.action) where.action = filters.action;

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: dhakaDayStartUtc(filters.from) } : {}),
      ...(filters.to ? { lte: dhakaDayEndUtc(filters.to) } : {}),
    };
  }

  const [total, actions, users] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      beforeJson: true,
      afterJson: true,
      createdAt: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  return {
    entries,
    total,
    page: currentPage,
    pageSize,
    pageCount,
    actions: actions.map((entry) => entry.action),
    users,
  };
}
