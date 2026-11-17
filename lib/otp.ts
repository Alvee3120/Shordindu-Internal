import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { OtpPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Email OTP rules (section 6 of the spec):
 * - 6-digit code, expires in 10 minutes
 * - at most 5 verification attempts per code
 * - at most 3 codes per 15 minutes per email and per IP
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_LIMIT = 3;
export const OTP_RESEND_WINDOW_MS = 15 * 60 * 1000;

/** Thrown when the email or IP has requested too many codes. */
export class OtpRateLimitError extends Error {
  constructor() {
    super("Too many codes requested. Please try again in 15 minutes.");
    this.name = "OtpRateLimitError";
  }
}

function getOtpSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to hash OTP codes");
  }
  return secret;
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(email: string, code: string): string {
  return createHmac("sha256", getOtpSecret())
    .update(`${email.trim().toLowerCase()}:${code}`)
    .digest("hex");
}

function hashesMatch(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  return (
    aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
  );
}

export interface IssueOtpParams {
  email: string;
  purpose: OtpPurpose;
  requestIp?: string | null;
}

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
}

/**
 * Creates a new OTP and invalidates any unused code for the same email and
 * purpose. Returns the plain code so the caller can email it; only the hash is
 * stored.
 */
export async function issueOtp({
  email,
  purpose,
  requestIp,
}: IssueOtpParams): Promise<IssuedOtp> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - OTP_RESEND_WINDOW_MS);

  const [emailRequests, ipRequests] = await Promise.all([
    prisma.otpCode.count({
      where: { email: normalizedEmail, createdAt: { gte: windowStart } },
    }),
    requestIp
      ? prisma.otpCode.count({
          where: { requestIp, createdAt: { gte: windowStart } },
        })
      : Promise.resolve(0),
  ]);

  if (emailRequests >= OTP_RESEND_LIMIT || ipRequests >= OTP_RESEND_LIMIT) {
    throw new OtpRateLimitError();
  }

  const code = generateOtpCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { email: normalizedEmail, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.otpCode.create({
      data: {
        email: normalizedEmail,
        purpose,
        codeHash: hashOtpCode(normalizedEmail, code),
        expiresAt,
        requestIp: requestIp ?? null,
        createdAt: now,
      },
    }),
  ]);

  return { code, expiresAt };
}

export type VerifyOtpFailure = "invalid" | "expired" | "locked";

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: VerifyOtpFailure };

/** User-facing message for a failed code check. */
export function otpFailureMessage(reason: VerifyOtpFailure): string {
  switch (reason) {
    case "locked":
      return "Too many incorrect attempts. Request a new code.";
    case "expired":
      return "That code has expired. Request a new code.";
    default:
      return "That code is invalid. Check the email and try again.";
  }
}

/** HTTP status for a failed code check. */
export function otpFailureStatus(reason: VerifyOtpFailure): number {
  return reason === "locked" ? 429 : 400;
}

/**
 * Checks a code against the latest unused OTP for the email and purpose.
 * Wrong codes count as attempts; the code is disabled after 5 failures.
 */
export async function verifyOtp({
  email,
  purpose,
  code,
}: {
  email: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<VerifyOtpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const record = await prisma.otpCode.findFirst({
    where: { email: normalizedEmail, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "invalid" };
  if (record.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  if (record.expiresAt <= now) return { ok: false, reason: "expired" };

  if (!hashesMatch(hashOtpCode(normalizedEmail, code), record.codeHash)) {
    const attempts = record.attempts + 1;
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts },
    });
    return {
      ok: false,
      reason: attempts >= OTP_MAX_ATTEMPTS ? "locked" : "invalid",
    };
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { usedAt: now },
  });

  return { ok: true };
}
