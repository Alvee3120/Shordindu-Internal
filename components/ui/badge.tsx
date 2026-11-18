import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "neutral"
  | "late"
  | "edited"
  | "onLeave"
  | "overdue"
  | "urgent"
  | "active"
  | "pending"
  | "rejected"
  | "disabled";

const variantStyles: Record<BadgeVariant, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  late: "bg-gold/30 text-gold-foreground",
  edited: "bg-secondary text-muted-foreground",
  onLeave: "bg-primary/10 text-primary",
  overdue: "bg-destructive/12 text-destructive",
  urgent: "bg-destructive text-destructive-foreground",
  active: "bg-primary/10 text-primary",
  pending: "bg-gold/30 text-gold-foreground",
  rejected: "bg-destructive/12 text-destructive",
  disabled: "bg-secondary text-muted-foreground",
};

const statusVariants: Record<string, BadgeVariant> = {
  Active: "active",
  Pending: "pending",
  Rejected: "rejected",
  Disabled: "disabled",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge variant={statusVariants[status] ?? "neutral"} className={className}>
      {status}
    </Badge>
  );
}
