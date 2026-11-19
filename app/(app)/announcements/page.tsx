import { requireUser } from "@/lib/auth";
import { canPostAnnouncement } from "@/lib/permissions";
import { AnnouncementsView } from "@/components/announcements/announcements-view";

export default async function AnnouncementsPage() {
  const user = await requireUser();

  return (
    <AnnouncementsView canPost={canPostAnnouncement(user.role)} />
  );
}
