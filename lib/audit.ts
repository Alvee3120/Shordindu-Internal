/**
 * Audit Log Helper.
 * Records actor, action, target, before/after snapshots, and timestamps.
 * Fully implemented in Module 1.
 */

export interface AuditLogEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  // Skeleton placeholder for Module 0.
  // Full persistence via prisma.auditLog in Module 1.
  if (process.env.NODE_ENV === "development") {
    console.log("[AUDIT]", entry);
  }
}
