import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateOtpCode,
  hashOtpCode,
  issueOtp,
  OtpRateLimitError,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_LIMIT,
  OTP_TTL_MS,
  verifyOtp,
} from "@/lib/otp";

const start = new Date("2026-11-17T10:00:00Z");
const touchedEmails: string[] = [];

function freshEmail(label: string): string {
  const email = `otp-test-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  touchedEmails.push(email);
  return email;
}

function wrongCodeFor(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

afterAll(async () => {
  await prisma.otpCode.deleteMany({
    where: {
      OR: [
        { email: { in: touchedEmails } },
        { requestIp: { startsWith: "test-ip-" } },
      ],
    },
  });
});

describe("OTP codes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a 6-digit code", () => {
    expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it("stores only a hash of the code, expiring in 10 minutes", async () => {
    const email = freshEmail("hash");
    const { code, expiresAt } = await issueOtp({
      email,
      purpose: "register",
    });

    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt.getTime()).toBe(start.getTime() + OTP_TTL_MS);

    const stored = await prisma.otpCode.findFirst({ where: { email } });
    expect(stored?.codeHash).toBe(hashOtpCode(email, code));
    expect(stored?.codeHash).not.toBe(code);
  });

  it("accepts the correct code exactly once", async () => {
    const email = freshEmail("once");
    const { code } = await issueOtp({ email, purpose: "register" });

    expect(await verifyOtp({ email, purpose: "register", code })).toEqual({
      ok: true,
    });
    expect(await verifyOtp({ email, purpose: "register", code })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects an expired code after 10 minutes", async () => {
    const email = freshEmail("expiry");
    const { code } = await issueOtp({ email, purpose: "reset" });

    vi.setSystemTime(new Date(start.getTime() + OTP_TTL_MS + 1000));

    expect(await verifyOtp({ email, purpose: "reset", code })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("locks the code after 5 wrong attempts", async () => {
    const email = freshEmail("attempts");
    const { code } = await issueOtp({ email, purpose: "reset" });
    const wrong = wrongCodeFor(code);

    for (let attempt = 1; attempt < OTP_MAX_ATTEMPTS; attempt++) {
      expect(await verifyOtp({ email, purpose: "reset", code: wrong })).toEqual({
        ok: false,
        reason: "invalid",
      });
    }

    expect(await verifyOtp({ email, purpose: "reset", code: wrong })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await verifyOtp({ email, purpose: "reset", code })).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("limits codes to 3 per 15 minutes per email", async () => {
    const email = freshEmail("email-limit");

    for (let request = 0; request < OTP_RESEND_LIMIT; request++) {
      await issueOtp({ email, purpose: "reset" });
    }

    await expect(issueOtp({ email, purpose: "reset" })).rejects.toBeInstanceOf(
      OtpRateLimitError,
    );
  });

  it("limits codes to 3 per 15 minutes per IP", async () => {
    const requestIp = `test-ip-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    for (let request = 0; request < OTP_RESEND_LIMIT; request++) {
      await issueOtp({
        email: freshEmail(`ip-${request}`),
        purpose: "reset",
        requestIp,
      });
    }

    await expect(
      issueOtp({
        email: freshEmail("ip-limit"),
        purpose: "reset",
        requestIp,
      }),
    ).rejects.toBeInstanceOf(OtpRateLimitError);
  });

  it("invalidates the previous code when a new one is issued", async () => {
    const email = freshEmail("reissue");
    const first = await issueOtp({ email, purpose: "reset" });
    const second = await issueOtp({ email, purpose: "reset" });

    expect(
      await verifyOtp({ email, purpose: "reset", code: first.code }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await verifyOtp({ email, purpose: "reset", code: second.code }),
    ).toEqual({ ok: true });
  });
});
