import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <AuthCard title="Sign in" subtitle="Enter your work email and password.">
      <LoginForm />
    </AuthCard>
  );
}
