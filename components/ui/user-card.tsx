import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserCard({
  name,
  position,
  department,
  avatarFile,
  size = "md",
  tone = "default",
  className,
}: {
  name: string;
  position: string;
  department: string;
  avatarFile?: string | null;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "light";
  className?: string;
}) {
  const onDark = tone === "light";

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar
        name={name}
        avatarFile={avatarFile}
        size={size}
        className={onDark ? "bg-white/15 text-sidebar-foreground" : undefined}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-sm font-medium",
            onDark && "text-sidebar-foreground"
          )}
        >
          {name}
        </p>
        <p
          className={cn(
            "truncate text-xs",
            onDark ? "text-sidebar-muted" : "text-muted-foreground"
          )}
        >
          {position} &middot; {department}
        </p>
      </div>
    </div>
  );
}
