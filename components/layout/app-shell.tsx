"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileText,
  Megaphone,
  Menu,
  MessageCircle,
  Newspaper,
  Settings,
  ShieldCheck,
  UserRound,
  UserX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { UserMenu } from "@/components/layout/user-menu";
import { ChatFab } from "@/components/chat/chat-fab";
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
    href: "/announcements",
    label: "Announcements",
    shortLabel: "Notices",
    icon: Megaphone,
    visible: () => true,
  },
  {
    href: "/chat",
    label: "Group chat",
    shortLabel: "Chat",
    icon: MessageCircle,
    visible: () => true,
  },
  {
    href: "/calendar",
    label: "My Calendar",
    shortLabel: "Calendar",
    icon: CalendarRange,
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
    href: "/profile",
    label: "Profile",
    shortLabel: "Profile",
    icon: UserRound,
    visible: () => true,
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const links = NAV_ITEMS.filter((item) => item.visible(user.role));
  const current = links.find((item) => isActive(pathname, item.href));

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

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
            avatarFile={user.avatarFile}
            size="sm"
            tone="light"
          />
        </div>
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          mobileNavOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileNavOpen}
        {...(mobileNavOpen ? {} : { inert: true })}
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          tabIndex={mobileNavOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-300",
            mobileNavOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[70%] max-w-sm flex-col bg-sidebar shadow-xl transition-transform duration-300 ease-out",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-20 items-center justify-between px-4">
            <Link
              href="/"
              aria-label="Shordindu home"
              className="rounded-lg transition hover:opacity-90"
            >
              <Logo height={40} />
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              tabIndex={mobileNavOpen ? 0 : -1}
              className="rounded-md p-2 text-sidebar-muted transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </button>
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
                  tabIndex={mobileNavOpen ? 0 : -1}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
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
              avatarFile={user.avatarFile}
              size="sm"
              tone="light"
            />
          </div>
        </aside>
      </div>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-navigation"
            className="-ml-1 rounded-md p-2 text-foreground transition hover:bg-accent lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <p className="hidden text-sm font-medium text-muted-foreground lg:block">
            {current?.label ?? ""}
          </p>

          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <ChatFab />
    </div>
  );
}
