import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { getDepartments } from "@/lib/settings";
import { UserManagement } from "@/components/users/user-management";

export default async function UsersPage() {
  const user = await requireUser();
  if (!user.role || !canManageUsers(user.role)) redirect("/");

  const departments = await getDepartments();

  return (
    <UserManagement
      actorRole={user.role}
      actorId={user.id}
      departments={departments}
    />
  );
}
