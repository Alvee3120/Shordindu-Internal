"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { fetchJson } from "@/components/api-client";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 30_000;

/**
 * Floating shortcut to the global chat, pinned to the bottom-right corner.
 * The badge shows messages posted since this user last opened the room.
 */
export function ChatFab() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const result = await fetchJson<{ unreadCount: number }>(
      "/api/chat/unread"
    );
    if (result.ok && result.data) setUnread(result.data.unreadCount);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [load]);

  // Reset the badge as soon as the user lands on the chat page.
  useEffect(() => {
    if (pathname === "/chat") setUnread(0);
  }, [pathname]);

  if (pathname === "/chat") return null;

  return (
    <Link
      href="/chat"
      aria-label={
        unread > 0
          ? `Open group chat, ${unread} unread message${unread === 1 ? "" : "s"}`
          : "Open group chat"
      }
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <MessageCircle className="h-6 w-6" />
      {unread > 0 ? (
        <span
          className={cn(
            "absolute -right-1 -top-1 flex min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-semibold leading-none text-destructive-foreground ring-2 ring-background"
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
