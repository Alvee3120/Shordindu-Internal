import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("stores a salted scrypt hash", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(
      /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/,
    );
    expect(hash).not.toContain("correct horse battery");
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(await verifyPassword("s3cret-password", hash)).toBe(true);
    expect(await verifyPassword("S3cret-password", hash)).toBe(false);
  });

  it("uses a fresh salt for every hash", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toBe(second);
    expect(await verifyPassword("same-password", first)).toBe(true);
    expect(await verifyPassword("same-password", second)).toBe(true);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});
