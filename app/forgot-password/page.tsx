import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function ForgotPasswordPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We will email you a 6-digit code to set a new password."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
