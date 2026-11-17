import { afterAll, describe, expect, it } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { LOGIN_MAX_ATTEMPTS, loginWithPassword } from "@/lib/login";

const PASSWORD = "correct horse battery";
const emails: string[] = [];
const ips: string[] = [];

function freshEmail(label: string): string {
  const email = `login-test-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  emails.push(email);
  return email;
}

function freshIp(): string {
  const ip = `test-login-ip-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  ips.push(ip);
  return ip;
}

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({
    where: { OR: [{ email: { in: emails } }, { ip: { in: ips } }] },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

async function createUser({
  status = UserStatus.Active,
  password = PASSWORD,
}: {
  status?: UserStatus;
  password?: string;
} = {}) {
  return prisma.user.create({
    data: {
      name: "Login Tester",
      email: freshEmail("user"),
      department: "IT",
      position: "Tester",
      role: Role.Employee,
      status,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
  });
}

describe("loginWithPassword", () => {
  it("accepts the correct password and clears failed attempts", async () => {
    const user = await createUser();

    expect(
      await loginWithPassword({ email: user.email, password: "wrong" }),
    ).toEqual({ ok: false, reason: "invalid" });

    const outcome = await loginWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.user.id).toBe(user.id);

    const attempts = await prisma.loginAttempt.count({
      where: { email: user.email },
    });
    expect(attempts).toBe(0);
  });

  it("locks after 5 failed attempts per email", async () => {
    const user = await createUser();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
      expect(
        await loginWithPassword({ email: user.email, password: "wrong" }),
      ).toEqual({ ok: false, reason: "invalid" });
    }

    expect(
      await loginWithPassword({ email: user.email, password: PASSWORD }),
    ).toEqual({ ok: false, reason: "locked" });
  });

  it("locks per IP across different emails", async () => {
    const ip = freshIp();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
      expect(
        await loginWithPassword({
          email: freshEmail(`ip-${attempt}`),
          password: "wrong",
          ip,
        }),
      ).toEqual({ ok: false, reason: "invalid" });
    }

    expect(
      await loginWithPassword({
        email: freshEmail("ip-lock"),
        password: "wrong",
        ip,
      }),
    ).toEqual({ ok: false, reason: "locked" });
  });

  it("returns inactive when the password is right but the account is not Active", async () => {
    const user = await createUser({ status: UserStatus.Pending });

    expect(
      await loginWithPassword({ email: user.email, password: PASSWORD }),
    ).toEqual({ ok: false, reason: "inactive", status: UserStatus.Pending });
  });

  it("returns invalid for unknown emails and counts the attempt", async () => {
    const email = freshEmail("unknown");

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
      expect(await loginWithPassword({ email, password: "wrong" })).toEqual({
        ok: false,
        reason: "invalid",
      });
    }

    expect(await loginWithPassword({ email, password: "wrong" })).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("rejects accounts without a password, such as the seeded Admin", async () => {
    const email = freshEmail("no-password");
    const user = await prisma.user.create({
      data: {
        name: "No Password",
        email,
        department: "Admin",
        position: "Admin",
        role: Role.Admin,
        status: UserStatus.Active,
        emailVerifiedAt: new Date(),
      },
    });

    expect(user.passwordHash).toBeNull();
    expect(
      await loginWithPassword({ email, password: "anything" }),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});
