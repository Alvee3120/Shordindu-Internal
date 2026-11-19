import { randomBytes } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

/**
 * Profile pictures.
 * Keep the database light: only the filename is stored, the bytes live on disk.
 * Incoming photos are resized server-side (never trusted from the client) to a
 * small square, centre-cropped so the avatar always fills its circle.
 */

/** Rendered size in pixels. Large enough for retina at a small file size. */
export const AVATAR_SIZE = 256;

/** Hard ceiling after resizing; a 256px WebP is normally well under this. */
export const AVATAR_MAX_BYTES = 300 * 1024;

/** Reject absurd uploads before we spend CPU resizing them. */
export const AVATAR_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_INPUT = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Where resized avatars are written. Kept outside `public` because Next treats
 * that folder as build output; files are served through /api/avatars instead.
 */
export function avatarDirectory(): string {
  return (
    process.env.AVATAR_UPLOAD_DIR ??
    path.join(process.cwd(), ".data", "avatars")
  );
}

export type AvatarFailure =
  | "invalid_type"
  | "too_large"
  | "corrupt_image"
  | "encode_failed";

export function avatarError(reason: AvatarFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "invalid_type":
      return { status: 400, message: "Upload a JPG, PNG or WebP image." };
    case "too_large":
      return { status: 413, message: "Keep the image under 10 MB." };
    case "corrupt_image":
      return { status: 400, message: "That image could not be read." };
    case "encode_failed":
      return { status: 500, message: "Could not process the image." };
  }
}

/**
 * Resizes to a square avatar. `fit: "cover"` scales the photo up/down and
 * centre-crops the overflow, so the result always fills the circle without
 * distortion. Output is WebP at a fixed small size, which keeps the file tiny.
 */
export async function processAvatar(
  buffer: Buffer,
  mimeType: string,
): Promise<{ ok: true; filename: string } | { ok: false; reason: AvatarFailure }> {
  if (!ALLOWED_INPUT.has(mimeType)) {
    return { ok: false, reason: "invalid_type" };
  }
  if (buffer.byteLength > AVATAR_MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  let encoded: Buffer;
  try {
    encoded = await sharp(buffer, { failOn: "error" })
      .rotate() // honour EXIF orientation before cropping
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: false,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch {
    return { ok: false, reason: "corrupt_image" };
  }

  if (encoded.byteLength > AVATAR_MAX_BYTES) {
    return { ok: false, reason: "encode_failed" };
  }

  const filename = `${randomBytes(16).toString("hex")}.webp`;
  const directory = avatarDirectory();

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), encoded);
  } catch {
    return { ok: false, reason: "encode_failed" };
  }

  return { ok: true, filename };
}

/** Removes a stored avatar, ignoring a file that is already gone. */
export async function deleteAvatarFile(filename: string | null): Promise<void> {
  if (!filename) return;
  // Only ever delete a bare filename, never a traversed path.
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return;
  }
  try {
    await unlink(path.join(avatarDirectory(), filename));
  } catch {
    // A missing file is not an error: the row is being cleared either way.
  }
}
