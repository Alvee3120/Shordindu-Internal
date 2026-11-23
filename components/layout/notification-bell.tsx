"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { fetchJson } from "@/components/api-client";
import { setAlertCount } from "@/lib/browser-alerts";
import { formatDhakaDate, formatDhakaTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface NotificationDto {
  id: string;
  type: string;
  message: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 45_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{
      notifications: NotificationDto[];
      unreadCount: number;
    }>("/api/notifications");

    if (result.ok && result.data) {
      setNotifications(result.data.notifications);
      setUnreadCount(result.data.unreadCount);

      const newestUnread = result.data.notifications.find(
        (notification) => !notification.readAt
      );
      setAlertCount("notifications", result.data.unreadCount, {
        title: "New notification",
        body: newestUnread
          ? newestUnread.message
          : `${result.data.unreadCount} unread notifications`,
        link: newestUnread?.link ?? "/",
        tag: "notifications",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Close on any click outside the bell. A capture-phase listener also catches
  // sidebar links, which sit above the header's stacking context.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function markRead(id?: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
    void load();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markRead()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Loading...
              </p>
            ) : null}

            {!loading && notifications.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : null}

            {notifications.map((notification) => (
              <Link
                key={notification.id}
                href={notification.link}
                onClick={() => {
                  setOpen(false);
                  void markRead(notification.id);
                }}
                className={cn(
                  "flex gap-2 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-muted",
                  !notification.readAt && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    notification.readAt ? "bg-transparent" : "bg-primary"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block",
                      !notification.readAt && "font-medium"
                    )}
                  >
                    {notification.message}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDhakaDate(notification.createdAt)} &middot;{" "}
                    {formatDhakaTime(notification.createdAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
