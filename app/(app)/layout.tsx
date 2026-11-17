import { AppShell } from "@/components/layout/app-shell";
import { SessionProvider } from "@/components/providers/session-provider";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <SessionProvider user={user}>
      <AppShell user={user}>{children}</AppShell>
    </SessionProvider>
  );
}
