import { Logo } from "@/components/ui/logo";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/10 sm:p-8">
        <div className="space-y-2 text-center">
          <div className="mx-auto w-fit rounded-xl bg-primary px-4 py-2.5">
            <Logo height={40} />
          </div>
          <h1 className="pt-1 text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
