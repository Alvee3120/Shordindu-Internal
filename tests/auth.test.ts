import { afterAll, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findSessionUser, issueSession } from "@/lib/auth";

const emails: string[] = [];

function freshEmail(): string {
  const email = `session-test-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  emails.push(email);
  return email;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  vi.useRealTimers();
});

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Session Tester",
      email: freshEmail(),
      department: "IT",
      position: "Tester",
      role: Role.Employee,
      status: UserStatus.Active,
      emailVerifiedAt: new Date(),
    },
  });
}

describe("sessions", () => {
  it("stores only a hash of the session token", async () => {
    const user = await createUser();
    const { token, expiresAt } = await issueSession(user.id);

    const stored = await prisma.session.findFirst({
      where: { userId: user.id },
    });
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.expiresAt.getTime()).toBe(expiresAt.getTime());

    const sessionUser = await findSessionUser(token);
    expect(sessionUser?.id).toBe(user.id);
    expect(sessionUser?.role).toBe(Role.Employee);
  });

  it("rejects an expired session", async () => {
    const user = await createUser();
    const { token } = await issueSession(user.id);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));

    expect(await findSessionUser(token)).toBeNull();
  });

  it("rejects sessions for users who are no longer Active", async () => {
    const user = await createUser();
    const { token } = await issueSession(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.Disabled },
    });

    expect(await findSessionUser(token)).toBeNull();
  });
});
