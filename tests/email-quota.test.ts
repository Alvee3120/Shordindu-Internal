import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  EmailQuotaExceededError,
  EmailRejectedError,
  EmailUnknownError,
  classifyEmailFailure,
  buildApprovalEmail,
  buildDailyReminderEmail,
  buildInviteEmail,
  buildOtpEmail,
  sendEmail,
  resetEmailTransports,
  type EmailPayload,
} from "@/lib/email";
import {
  claimEmailSlot,
  emailQuotaLimit,
  emailUsageToday,
} from "@/lib/email-quota";
import { DAILY_REMINDER_JOB, runDailyUpdateReminder } from "@/jobs/reminders";
import { dhakaToday } from "@/lib/time";

const mail = (to: string, subject = "Test"): EmailPayload => ({
  to,
  subject,
  html: "<p>hi</p>",
});

const createdUserIds: string[] = [];

async function createUser(name: string, status = UserStatus.Active) {
  const user = await prisma.user.create({
    data: {
      name,
      email: `quota-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      department: "IT",
      position: "Tester",
      role: Role.Employee,
      status,
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);
  return user;
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.EMAIL_AUTH_DAILY_LIMIT;
  delete process.env.EMAIL_BULK_DAILY_LIMIT;
  delete process.env.EMAIL_LOW_PRIORITY_RESERVE;
});

afterEach(() => {
  vi.restoreAllMocks();
  resetEmailTransports();
});

afterAll(async () => {
  await prisma.jobRun.deleteMany({ where: { job: DAILY_REMINDER_JOB } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("account routing", () => {
  it("sends sign-in mail through the auth account", () => {
    expect(buildOtpEmail({ to: "a@test.local", code: "123456", purpose: "register", expiresAt: new Date() }).account).toBe("auth");
    expect(buildInviteEmail({ to: "a@test.local", name: "A" }).account).toBe("auth");
    expect(buildApprovalEmail({ to: "a@test.local", name: "A", role: "Employee" }).account).toBe("auth");
  });

  it("sends reminders through the bulk account", () => {
    expect(buildDailyReminderEmail({ to: "a@test.local", name: "A", date: "2026-11-17" }).account).toBe("bulk");
  });
});

describe("daily quota", () => {
  it("counts each claim and refuses once the cap is reached", async () => {
    const account = "auth";
    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = $1`,
      account,
    );

    expect(await claimEmailSlot(account, 2, "normal")).toBe(true);
    expect(await claimEmailSlot(account, 2, "normal")).toBe(true);
    expect(await claimEmailSlot(account, 2, "normal")).toBe(false);
    expect(await emailUsageToday(account)).toBe(2);

    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = $1`,
      account,
    );
  });

  it("holds slots back from low-priority mail", async () => {
    const account = "bulk";
    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = $1`,
      account,
    );
    process.env.EMAIL_LOW_PRIORITY_RESERVE = "2";

    // Limited 4 with reserve 2 leaves low-priority mail only 2 slots.
    expect(await claimEmailSlot(account, 4, "low")).toBe(true);
    expect(await claimEmailSlot(account, 4, "low")).toBe(true);
    expect(await claimEmailSlot(account, 4, "low")).toBe(false);
    // Normal mail still has the reserved slots.
    expect(await claimEmailSlot(account, 4, "normal")).toBe(true);
    expect(await claimEmailSlot(account, 4, "normal")).toBe(true);
    expect(await claimEmailSlot(account, 4, "normal")).toBe(false);

    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = $1`,
      account,
    );
  });

  it("reports sends already counted for today", async () => {
    const account = "bulk";
    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = $1`,
      account,
    );
    expect(await emailUsageToday(account)).toBe(0);

    await claimEmailSlot(account, 10, "normal");
    await claimEmailSlot(account, 10, "normal");
    expect(await emailUsageToday(account)).toBe(2);

    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = $1`,
      account,
    );
  });

  it("treats a zero limit as unlimited", async () => {
    process.env.EMAIL_BULK_DAILY_LIMIT = "0";
    expect(emailQuotaLimit("bulk")).toBe(0);
    // A zero limit claims without touching the counter.
    expect(await claimEmailSlot("bulk", 0, "normal")).toBe(true);
  });

  it("refuses to send when the account is out of slots", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_BULK_DAILY_LIMIT", "1");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "provider-id" }), { status: 200 }),
      );
    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = 'bulk'`,
    );

    await expect(sendEmail(mail("first@test.local"))).resolves.toBeDefined();
    await expect(sendEmail(mail("second@test.local"))).rejects.toBeInstanceOf(
      EmailQuotaExceededError,
    );
    // The blocked send never reached the provider.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllEnvs();
    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = 'bulk'`,
    );
  });
});

describe("failure classification", () => {
  it("never retries a send with an unknown outcome", () => {
    expect(classifyEmailFailure(new EmailUnknownError("socket hang up"))).toBe("drop");
  });

  it("retries only temporary provider refusals", () => {
    expect(classifyEmailFailure(new EmailRejectedError("429", true))).toBe("retry");
    expect(classifyEmailFailure(new EmailRejectedError("550", false))).toBe("drop");
  });

  it("drops a send that hit the daily cap", () => {
    expect(classifyEmailFailure(new EmailQuotaExceededError("bulk"))).toBe("drop");
  });
});

describe("reminders under quota pressure", () => {
  it("stops at the cap and records how many were skipped", async () => {
    await createUser("Quota First");
    await createUser("Quota Second");
    await prisma.jobRun.deleteMany({ where: { job: DAILY_REMINDER_JOB } });

    let attempts = 0;
    const result = await runDailyUpdateReminder(async () => {
      attempts++;
      // Pretend the second send runs into the daily cap.
      if (attempts === 2) throw new EmailQuotaExceededError("bulk");
    });

    // Only the first email went out, and the run explains why the rest did not.
    expect(result.emailCount).toBe(1);
    expect(result.detail).toContain("daily email quota reached");

    const run = await prisma.jobRun.findUnique({
      where: {
        job_runDate: {
          job: DAILY_REMINDER_JOB,
          runDate: new Date(`${dhakaToday()}T00:00:00.000Z`),
        },
      },
    });
    expect(run?.status).toBe("completed");
    expect(run?.detail).toContain("daily email quota reached");
  });

  it("keeps sending to later recipients after one send fails", async () => {
    await createUser("Resilient One");
    await createUser("Resilient Two");
    await prisma.jobRun.deleteMany({ where: { job: DAILY_REMINDER_JOB } });

    const delivered: string[] = [];
    let calls = 0;
    const result = await runDailyUpdateReminder(async (payload) => {
      calls++;
      if (calls === 1) throw new Error("single recipient failure");
      delivered.push(payload.to);
    });

    expect(delivered.length).toBeGreaterThan(0);
    expect(result.emailCount).toBe(delivered.length);
    expect(result.detail).toContain("failed");
  });

  it("queues only as many reminders as the daily allowance allows", async () => {
    await createUser("Budget One");
    await createUser("Budget Two");
    await createUser("Budget Three");
    await prisma.jobRun.deleteMany({ where: { job: DAILY_REMINDER_JOB } });
    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = 'bulk'`,
    );
    process.env.EMAIL_BULK_DAILY_LIMIT = "1";
    process.env.EMAIL_LOW_PRIORITY_RESERVE = "0";

    const queued: EmailPayload[] = [];
    const result = await runDailyUpdateReminder(async (payload) => {
      queued.push(payload);
    });

    expect(queued).toHaveLength(1);
    expect(result.emailCount).toBe(1);
    expect(result.detail).toContain("daily email quota reached");

    process.env.EMAIL_BULK_DAILY_LIMIT = "0";
    await prisma.$executeRawUnsafe(
      `delete from "email_account_usage" where "account" = 'bulk'`,
    );
  });
});
