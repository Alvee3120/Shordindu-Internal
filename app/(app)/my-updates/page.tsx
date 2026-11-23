import { requireUser } from "@/lib/auth";
import { dhakaToday } from "@/lib/time";
import { MyUpdates } from "@/components/updates/my-updates";

export default async function MyUpdatesPage() {
  const user = await requireUser();

  return (
    <MyUpdates
      author={{
        name: user.name,
        position: user.position,
        department: user.department,
        avatarFile: user.avatarFile,
      }}
      today={dhakaToday()}
    />
  );
}
