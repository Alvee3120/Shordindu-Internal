/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";
import { avatarUrl } from "@/lib/avatar-url";

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Profile picture, falling back to initials when the user has none.
 * A plain <img> is used deliberately: these are local, already-resized files
 * served by our own route, so Next's optimizer would add no value.
 */
export function Avatar({
  name,
  avatarFile,
  size = "md",
  className,
}: {
  name: string;
  avatarFile?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const url = avatarUrl(avatarFile ?? null);

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={48}
        height={48}
        className={cn(
          "shrink-0 select-none rounded-full object-cover",
          sizes[size],
          className
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        sizes[size],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
