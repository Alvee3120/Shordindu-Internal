import { afterAll, describe, expect, it } from "vitest";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

describe("lib/audit", () => {
  const targetId = `test-audit-${Date.now()}`;

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetId } });
  });

  it("persists actor, action, target and before/after values", async () => {
    await logAudit({
      actorId: null,
      action: "test.action",
      targetType: "test",
      targetId,
      beforeJson: { status: "open" },
      afterJson: { status: "completed" },
    });

    const entry = await prisma.auditLog.findFirst({ where: { targetId } });
    expect(entry).not.toBeNull();
    expect(entry?.action).toBe("test.action");
    expect(entry?.beforeJson).toEqual({ status: "open" });
    expect(entry?.afterJson).toEqual({ status: "completed" });
    expect(entry?.createdAt).toBeInstanceOf(Date);
  });
});
