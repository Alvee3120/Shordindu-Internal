import Image from "next/image";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-2 text-center">
          <Image
            src="/logo.png"
            alt="Shordindu"
            width={2944}
            height={1849}
            priority
            className="mx-auto h-20 w-auto dark:rounded-md dark:bg-white/95 dark:p-1.5"
          />
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
