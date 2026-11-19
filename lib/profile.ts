import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { deleteAvatarFile } from "@/lib/avatar";
import type { SessionUser } from "@/lib/auth";

/**
 * Self-service profile changes.
 * A user may update their own display name and profile picture. Role,
 * department, position and status stay with the approvers who manage users.
 */

export interface ProfileView {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  avatarFile: string | null;
}

export type ProfileFailure = "not_found" | "no_changes";

export type ProfileResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: ProfileFailure };

export function profileError(reason: ProfileFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "Profile not found." };
    case "no_changes":
      return { status: 400, message: "Nothing to update." };
  }
}

export async function getProfile(userId: string): Promise<ProfileView | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      department: true,
      avatarFile: true,
    },
  });
}

/** Renames the signed-in user. The new name shows everywhere immediately. */
export async function updateProfileName(
  actor: SessionUser,
  name: string,
): Promise<ProfileResult<ProfileView>> {
  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { name: true, avatarFile: true },
  });
  if (!current) return { ok: false, reason: "not_found" };
  if (current.name === name) return { ok: false, reason: "no_changes" };

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: actor.id },
      data: { name },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        department: true,
        avatarFile: true,
      },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "profile.name_changed",
        targetType: "user",
        targetId: actor.id,
        beforeJson: { name: current.name },
        afterJson: { name },
      },
      tx,
    );
    return updated;
  });

  return { ok: true, data: saved };
}

/** Replaces the profile picture and removes the previous file from disk. */
export async function updateProfileAvatar(
  actor: SessionUser,
  filename: string,
): Promise<ProfileResult<ProfileView>> {
  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { avatarFile: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: actor.id },
      data: { avatarFile: filename },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        department: true,
        avatarFile: true,
      },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "profile.avatar_changed",
        targetType: "user",
        targetId: actor.id,
        beforeJson: { avatarFile: current.avatarFile },
        afterJson: { avatarFile: filename },
      },
      tx,
    );
    return updated;
  });

  // Only unlink after the row is safely pointing at the new file.
  await deleteAvatarFile(current.avatarFile);

  return { ok: true, data: saved };
}

/** Clears the profile picture and deletes the file. */
export async function removeProfileAvatar(
  actor: SessionUser,
): Promise<ProfileResult<ProfileView>> {
  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { avatarFile: true },
  });
  if (!current) return { ok: false, reason: "not_found" };
  if (!current.avatarFile) return { ok: false, reason: "no_changes" };

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: actor.id },
      data: { avatarFile: null },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        department: true,
        avatarFile: true,
      },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "profile.avatar_removed",
        targetType: "user",
        targetId: actor.id,
        beforeJson: { avatarFile: current.avatarFile },
      },
      tx,
    );
    return updated;
  });

  await deleteAvatarFile(current.avatarFile);

  return { ok: true, data: saved };
}
