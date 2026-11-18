"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
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
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      aria-label="Sign out"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition hover:bg-destructive hover:text-white disabled:opacity-60",
        className
      )}
    >
      <LogOut className="h-4 w-4" />
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
