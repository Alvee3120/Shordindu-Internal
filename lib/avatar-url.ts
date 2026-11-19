/**
 * Client-safe helpers for profile pictures.
 * Kept separate from `lib/avatar.ts` on purpose: that module imports sharp,
 * which is Node-only and would break the browser bundle.
 */

/** Public URL for a stored avatar, or null when the user has none. */
export function avatarUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return `/api/avatars/${filename}`;
}
