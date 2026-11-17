import { requireUser } from "@/lib/auth";
import { getDepartments } from "@/lib/settings";
import { AssignmentsView } from "@/components/assignments/assignments-view";

export default async function AssignmentsPage() {
  await requireUser();
  const departments = await getDepartments();

  return <AssignmentsView departments={departments} />;
}
