import { UserStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getDummyPasswordHash, verifyPassword } from "@/lib/password";

/** 5 failed password attempts per 15 minutes, per email and per IP. */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * The failed-attempt lockout protects real deployments, but it gets in the way
 * while developing by hand. It is therefore skipped only when NODE_ENV is
 * exactly "development"; production and the test run both enforce it.
 */
export function loginLockoutEnabled(): boolean {
  return process.env.NODE_ENV !== "development";
}

export type LoginOutcome =
  | { ok: true; user: User }
  | { ok: false; reason: "locked" }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "inactive"; status: UserStatus }
  | { ok: false; reason: "no-role" };

/**
 * Verifies email + password and enforces failed-attempt limits.
 * Locked and invalid answers stay generic so the response never reveals
 * whether the email exists.
 */
export async function loginWithPassword({
  email,
  password,
  ip,
}: {
  email: string;
  password: string;
  ip?: string | null;
}): Promise<LoginOutcome> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  if (loginLockoutEnabled()) {
    const windowStart = new Date(now.getTime() - LOGIN_ATTEMPT_WINDOW_MS);
    const [emailAttempts, ipAttempts] = await Promise.all([
      prisma.loginAttempt.count({
        where: { email: normalizedEmail, createdAt: { gte: windowStart } },
      }),
      ip
        ? prisma.loginAttempt.count({
            where: { ip, createdAt: { gte: windowStart } },
          })
        : Promise.resolve(0),
    ]);

    if (
      emailAttempts >= LOGIN_MAX_ATTEMPTS ||
      ipAttempts >= LOGIN_MAX_ATTEMPTS
    ) {
      return { ok: false, reason: "locked" };
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Always run a scrypt check, even for unknown emails, to keep timing stable.
  const hashToCheck = user?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(password, hashToCheck);

  if (!user || !user.passwordHash || !passwordMatches) {
    await prisma.loginAttempt.create({
      data: { email: normalizedEmail, ip: ip ?? null, createdAt: now },
    });
    return { ok: false, reason: "invalid" };
  }

  await prisma.loginAttempt.deleteMany({
    where: { email: normalizedEmail },
  });

  if (user.status !== UserStatus.Active) {
    return { ok: false, reason: "inactive", status: user.status };
  }
  if (!user.role) {
    return { ok: false, reason: "no-role" };
  }

  return { ok: true, user };
}
