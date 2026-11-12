import Link from "next/link";
import {
  CheckCircle2,
  Database,
  Clock,
  ShieldCheck,
  Terminal,
  Layers,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950 sm:p-12">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Shordindu Internal
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Daily updates, assignments, and company collaboration platform
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Module 0 Initialized
            </div>
          </div>
        </header>

        {/* Status Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <Clock className="h-4 w-4 text-primary" />
              Timezone Standard
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Asia/Dhaka
            </p>
            <p className="text-xs text-slate-500">
              UTC+6 single source of truth for company calendar days
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <Database className="h-4 w-4 text-primary" />
              Database Engine
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              PostgreSQL + Prisma
            </p>
            <p className="text-xs text-slate-500">
              Prisma client connected with local Docker Compose
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security Standard
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Strict Server Locks
            </p>
            <p className="text-xs text-slate-500">
              HttpOnly sessions, server-side locks & HTML sanitization
            </p>
          </div>
        </div>

        {/* System Health Check Callout */}
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Health Endpoint Verification
              </h2>
            </div>
            <Link
              href="/api/health"
              target="_blank"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Test /api/health →
            </Link>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The health check route verifies server uptime, environment
            configuration, and active database connectivity via Prisma.
          </p>
        </div>

        {/* Architecture & Folder Structure Overview */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Layers className="h-5 w-5 text-primary" />
            Project Structure & Utilities
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <code className="font-mono text-xs font-semibold text-primary">
                lib/time.ts
              </code>
              <p className="mt-1 text-xs text-slate-500">
                Shared Dhaka calendar calculations & date comparison
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <code className="font-mono text-xs font-semibold text-primary">
                lib/sanitize.ts
              </code>
              <p className="mt-1 text-xs text-slate-500">
                Server-side HTML sanitizer & search plain-text extractor
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <code className="font-mono text-xs font-semibold text-primary">
                lib/permissions.ts
              </code>
              <p className="mt-1 text-xs text-slate-500">
                Role checkers (Admin, HR, Manager, Employee)
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <code className="font-mono text-xs font-semibold text-primary">
                lib/audit.ts
              </code>
              <p className="mt-1 text-xs text-slate-500">
                Structured audit log recorder for all mutations
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <code className="font-mono text-xs font-semibold text-primary">
                lib/email.ts
              </code>
              <p className="mt-1 text-xs text-slate-500">
                Email dispatcher adapter (Console, SMTP, Resend)
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <code className="font-mono text-xs font-semibold text-primary">
                jobs/
              </code>
              <p className="mt-1 text-xs text-slate-500">
                pg-boss background jobs & 7 PM Dhaka reminder cron
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-4 text-center text-xs text-slate-400 dark:text-slate-600">
          Shordindu Internal &bull; Built with Next.js App Router, Prisma,
          Tailwind, and shadcn/ui
        </footer>
      </div>
    </main>
  );
}
