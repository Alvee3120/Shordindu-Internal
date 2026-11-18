"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Newspaper,
  Settings,
  ShieldCheck,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { UserMenu } from "@/components/layout/user-menu";
import { UserCard } from "@/components/ui/user-card";
import { Logo } from "@/components/ui/logo";
import {
  canManageSettings,
  canManageUsers,
  canViewAuditLog,
  canViewNotSubmittedList,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  visible: (role: SessionUser["role"]) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Feed",
    shortLabel: "Feed",
    icon: Newspaper,
    visible: () => true,
  },
  {
    href: "/my-updates",
    label: "My Updates",
    shortLabel: "My Updates",
    icon: FileText,
    visible: () => true,
  },
  {
    href: "/assignments",
    label: "Assignments",
    shortLabel: "Assignments",
    icon: ClipboardList,
    visible: () => true,
  },
  {
    href: "/users",
    label: "Users",
    shortLabel: "Users",
    icon: Users,
    visible: canManageUsers,
  },
  {
    href: "/leave",
    label: "Leave & Holidays",
    shortLabel: "Leave",
    icon: CalendarDays,
    visible: () => true,
  },
  {
    href: "/not-submitted",
    label: "Not submitted",
    shortLabel: "Missing",
    icon: UserX,
    visible: canViewNotSubmittedList,
  },
  {
    href: "/audit",
    label: "Audit",
    shortLabel: "Audit",
    icon: ShieldCheck,
    visible: canViewAuditLog,
  },
  {
    href: "/settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: Settings,
    visible: canManageSettings,
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href;
}

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const links = NAV_ITEMS.filter((item) => item.visible(user.role));
  const current = links.find((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">
        <div className="flex h-24 items-center justify-center px-5">
          <Link
            href="/"
            aria-label="Shordindu home"
            className="rounded-lg transition hover:opacity-90"
          >
            <Logo height={54} />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {links.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-gold text-gold-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3">
          <SignOutButton />
          <div className="my-2 border-t border-white/10" />
          <UserCard
            name={user.name}
            position={user.position}
            department={user.department}
            size="sm"
            tone="light"
          />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
          <Link
            href="/"
            aria-label="Shordindu home"
            className="flex items-center rounded-lg bg-primary px-2.5 py-1.5 lg:hidden"
          >
            <Logo height={26} />
          </Link>
          <p className="hidden text-sm font-medium text-muted-foreground lg:block">
            {current?.label ?? ""}
          </p>

          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>

        <nav className="flex flex-wrap gap-1 border-b border-border bg-card px-2 py-2 lg:hidden">
          {links.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.shortLabel}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
