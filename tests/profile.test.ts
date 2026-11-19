import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZE,
  avatarDirectory,
  processAvatar,
} from "@/lib/avatar";
import {
  getProfile,
  removeProfileAvatar,
  updateProfileAvatar,
  updateProfileName,
} from "@/lib/profile";
import { profileNameSchema } from "@/lib/validators";

// Write to a throwaway directory so the real upload folder is untouched.
let testDir: string;
const createdUserIds: string[] = [];

beforeAll(() => {
  testDir = path.join(os.tmpdir(), `shordindu-avatars-${Date.now()}`);
  process.env.AVATAR_UPLOAD_DIR = testDir;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { actorId: { in: createdUserIds } },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await rm(testDir, { recursive: true, force: true });
  delete process.env.AVATAR_UPLOAD_DIR;
});

async function createUser(name = "Profile User"): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `profile-test-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      department: "IT",
      position: "Tester",
      role: "Employee",
      status: "Active",
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department,
    position: user.position,
    avatarFile: user.avatarFile,
  };
}

/** A large, deliberately non-square photo, like a real phone upload. */
async function largePhoto(): Promise<Buffer> {
  // Random noise compresses badly, which makes this behave like a real photo
  // rather than a flat colour that would shrink to a few kilobytes.
  const width = 1200;
  const height = 900;
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = Math.floor(Math.random() * 256);
  }

  return sharp(raw, { raw: { width, height, channels } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

describe("avatar processing", () => {
  it("shrinks a large photo to a small square, without distortion", async () => {
    const input = await largePhoto();
    // Sanity check: the source really is large.
    expect(input.byteLength).toBeGreaterThan(20_000);

    const result = await processAvatar(input, "image/jpeg");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { readFile } = await import("fs/promises");
    const bytes = await readFile(path.join(testDir, result.filename));
    const meta = await sharp(bytes).metadata();

    // Square, exactly the target size, and well under the ceiling.
    expect(meta.width).toBe(AVATAR_SIZE);
    expect(meta.height).toBe(AVATAR_SIZE);
    expect(meta.format).toBe("webp");
    expect(bytes.byteLength).toBeLessThan(AVATAR_MAX_BYTES);
    expect(bytes.byteLength).toBeLessThan(100 * 1024);
  });

  it("rejects a non-image upload", async () => {
    const result = await processAvatar(Buffer.from("not an image"), "text/plain");
    expect(result).toEqual({ ok: false, reason: "invalid_type" });
  });

  it("rejects a corrupt image that claims to be a JPEG", async () => {
    const result = await processAvatar(
      Buffer.from("garbage bytes here"),
      "image/jpeg"
    );
    expect(result).toEqual({ ok: false, reason: "corrupt_image" });
  });

  it("rejects an upload over the size limit", async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024);
    const result = await processAvatar(huge, "image/jpeg");
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("profile updates", () => {
  it("changes the user's own name", async () => {
    const user = await createUser("Old Name");

    const result = await updateProfileName(user, "New Name");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("New Name");

    const stored = await getProfile(user.id);
    expect(stored?.name).toBe("New Name");
  });

  it("refuses a name that has not changed", async () => {
    const user = await createUser("Same Name");
    expect(await updateProfileName(user, "Same Name")).toEqual({
      ok: false,
      reason: "no_changes",
    });
  });

  it("validates the name", () => {
    expect(profileNameSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(profileNameSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(profileNameSchema.safeParse({ name: "Valid Name" }).success).toBe(
      true
    );
  });

  it("stores only the filename, and clears it on removal", async () => {
    const user = await createUser("Avatar Owner");
    const input = await largePhoto();

    const processed = await processAvatar(input, "image/jpeg");
    expect(processed.ok).toBe(true);
    if (!processed.ok) return;

    const saved = await updateProfileAvatar(user, processed.filename);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.avatarFile).toBe(processed.filename);

    const stored = await getProfile(user.id);
    expect(stored?.avatarFile).toBe(processed.filename);

    const removed = await removeProfileAvatar({
      ...user,
      avatarFile: processed.filename,
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.data.avatarFile).toBeNull();
  });

  it("removing when there is no picture is a no-op failure", async () => {
    const user = await createUser("No Picture");
    expect(await removeProfileAvatar(user)).toEqual({
      ok: false,
      reason: "no_changes",
    });
  });
});
