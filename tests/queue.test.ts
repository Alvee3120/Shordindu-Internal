import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { enqueueEmail, setTestEmailSink } from "@/lib/queue";
import type { EmailPayload } from "@/lib/email";

const payload: EmailPayload = {
  to: "queue-guard@example.com",
  subject: "Queue guard test",
  html: "<p>hi</p>",
};

async function queuedCount(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    "select count(*)::int as n from pgboss.job where name = 'email.send' and data->>'subject' = $1",
    payload.subject,
  );
  return rows[0]?.n ?? 0;
}

afterEach(() => {
  setTestEmailSink(null);
});

/**
 * Regression guard: tests once queued real pg-boss jobs, which a later dev
 * server picked up and flushed as real emails to every user.
 */
describe("email queue under test", () => {
  it("does not insert a pg-boss job while running tests", async () => {
    await enqueueEmail(payload);
    expect(await queuedCount()).toBe(0);
  });

  it("captures queued emails in a sink when one is set", async () => {
    const collected: EmailPayload[] = [];
    setTestEmailSink(collected);

    await enqueueEmail(payload);

    expect(collected).toHaveLength(1);
    expect(collected[0]?.subject).toBe(payload.subject);
    expect(await queuedCount()).toBe(0);
  });
});
