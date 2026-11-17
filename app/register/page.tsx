import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDepartments } from "@/lib/settings";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  const departments = await getDepartments();

  return (
    <AuthCard
      title="Create an account"
      subtitle="Your account is reviewed by an admin before you can sign in."
    >
      <RegisterForm departments={departments} />
    </AuthCard>
  );
}
