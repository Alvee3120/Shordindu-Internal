"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { SessionUser } from "@/lib/auth";

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-accent"
      >
        <Avatar
          name={user.name}
          avatarFile={user.avatarFile}
          size="sm"
        />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight">
            {user.name}
          </span>
          <span className="block text-xs leading-tight text-muted-foreground">
            {user.role}
          </span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close user menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-border bg-card p-3 shadow-lg"
          >
            <div className="space-y-0.5 border-b border-border pb-3">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.position} &middot; {user.department}
              </p>
            </div>

            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition hover:bg-accent"
            >
              <UserRound className="h-4 w-4" />
              Profile
            </Link>

            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              disabled={pending}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {pending ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
