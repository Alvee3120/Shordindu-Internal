import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserCard({
  name,
  position,
  department,
  size = "md",
  className,
}: {
  name: string;
  position: string;
  department: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar name={name} size={size} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {position} &middot; {department}
        </p>
      </div>
    </div>
  );
}
