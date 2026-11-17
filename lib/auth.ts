import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, UserStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

const DEFAULT_SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: UserStatus;
  department: string;
  position: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionMaxAgeSeconds(): number {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS ?? DEFAULT_SESSION_DAYS);
  const validDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_DAYS;
  return validDays * 24 * 60 * 60;
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department,
    position: user.position,
  };
}

/** Creates a session row and returns the raw token (only its hash is stored). */
export async function issueSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds() * 1000);

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, expiresAt };
}

/** Resolves a raw session token to an Active user, or null. */
export async function findSessionUser(
  token: string,
): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) return null;
  if (session.user.status !== UserStatus.Active) return null;

  return toSessionUser(session.user);
}

export function setSessionCookie(token: string, expiresAt: Date): void {
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return findSessionUser(token);
}

export async function destroyCurrentSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  clearSessionCookie();
}

/** Clear message shown when a non-Active user tries to sign in. */
export function accountStatusMessage(status: UserStatus): string {
  switch (status) {
    case UserStatus.Pending:
      return "Your account is waiting for approval. You can sign in once it is approved.";
    case UserStatus.Rejected:
      return "Your registration was not approved. Please contact your administrator.";
    case UserStatus.Disabled:
      return "Your account has been disabled. Please contact your administrator.";
    default:
      return "Your account is not ready. Please contact your administrator.";
  }
}

/** For server components and server actions: redirects to /login when missing. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
