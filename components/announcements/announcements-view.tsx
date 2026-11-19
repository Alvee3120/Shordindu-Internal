"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { fetchJson } from "@/components/api-client";
import type { AnnouncementDto } from "@/components/announcements/types";

export function AnnouncementsView({ canPost }: { canPost: boolean }) {
  const [announcements, setAnnouncements] = useState<AnnouncementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{ announcements: AnnouncementDto[] }>(
      "/api/announcements"
    );
    setLoading(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load announcements.");
      return;
    }

    setError(null);
    setAnnouncements(result.data.announcements);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function upsert(saved: AnnouncementDto) {
    setAnnouncements((previous) => {
      const exists = previous.some((item) => item.id === saved.id);
      if (!exists) return [saved, ...previous];
      return previous.map((item) => (item.id === saved.id ? saved : item));
    });
  }

  function remove(id: string) {
    setAnnouncements((previous) =>
      previous.filter((item) => item.id !== id)
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Notices and company information. Everyone receives an email when a
            new announcement is posted.
          </p>
        </div>
        {canPost ? (
          <Button
            onClick={() => setCreating((value) => !value)}
            variant={creating ? "outline" : "default"}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {creating ? "Close" : "New announcement"}
          </Button>
        ) : null}
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {creating && canPost ? (
        <AnnouncementForm
          onSaved={(saved) => {
            setCreating(false);
            upsert(saved);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description={
            canPost
              ? "Post the first notice to let everyone know."
              : "When Admin, HR or a Manager posts a notice, it will appear here."
          }
        />
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onChanged={(saved) => {
                if (saved) upsert(saved);
                else remove(announcement.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
