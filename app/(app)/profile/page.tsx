import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { ProfileView } from "@/components/profile/profile-view";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  if (!profile) {
    return null;
  }

  return (
    <ProfileView
      initialProfile={{
        id: profile.id,
        name: profile.name,
        email: profile.email,
        position: profile.position,
        department: profile.department,
        avatarFile: profile.avatarFile,
      }}
    />
  );
}
