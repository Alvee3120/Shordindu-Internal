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
  neutral:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  late: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  edited:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  onLeave: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  overdue: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  urgent: "bg-rose-600 text-white dark:bg-rose-500 dark:text-white",
  active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  disabled:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
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
        className,
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
