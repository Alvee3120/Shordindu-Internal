import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canViewAuditLog } from "@/lib/permissions";
import { listAuditLog } from "@/lib/audit";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDhakaDate, formatDhakaTime } from "@/lib/time";

interface SearchParams {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
}

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  if (!canViewAuditLog(user.role)) redirect("/");

  const actorId =
    searchParams.actor === "system" || isUuid(searchParams.actor)
      ? searchParams.actor
      : undefined;
  const action = searchParams.action || undefined;
  const from = isDate(searchParams.from) ? searchParams.from : undefined;
  const to = isDate(searchParams.to) ? searchParams.to : undefined;
  const requestedPage = Number(searchParams.page) || 1;

  const data = await listAuditLog({ actorId, action, from, to }, requestedPage);

  const baseParams = new URLSearchParams();
  if (actorId) baseParams.set("actor", actorId);
  if (action) baseParams.set("action", action);
  if (from) baseParams.set("from", from);
  if (to) baseParams.set("to", to);

  function pageHref(page: number): string {
    const params = new URLSearchParams(baseParams);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/audit?${query}` : "/audit";
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every create, edit, delete, approval and role change.
        </p>
      </header>

      <form
        method="get"
        action="/audit"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
      >
        <div className="space-y-1.5">
          <label htmlFor="audit-actor" className="text-sm font-medium">
            User
          </label>
          <select
            id="audit-actor"
            name="actor"
            defaultValue={actorId ?? ""}
            className={inputClass}
          >
            <option value="">Everyone</option>
            <option value="system">System</option>
            {data.users.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="audit-action" className="text-sm font-medium">
            Action
          </label>
          <select
            id="audit-action"
            name="action"
            defaultValue={action ?? ""}
            className={inputClass}
          >
            <option value="">Any action</option>
            {data.actions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="audit-from" className="text-sm font-medium">
            From
          </label>
          <input
            id="audit-from"
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="audit-to" className="text-sm font-medium">
            To
          </label>
          <input
            id="audit-to"
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className={inputClass}
          />
        </div>

        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit">Filter</Button>
          <Link
            href="/audit"
            className={buttonVariants({ variant: "outline" })}
          >
            Clear
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.total} {data.total === 1 ? "entry" : "entries"} &middot; page{" "}
          {data.page} of {data.pageCount}
        </p>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={pageHref(data.page - 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          ) : null}
          {data.page < data.pageCount ? (
            <Link
              href={pageHref(data.page + 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>

      <section className="space-y-2">
        {data.entries.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No audit entries found"
            description="Try different filters or clear them."
          />
        ) : null}

        {data.entries.map((entry) => (
          <details
            key={entry.id}
            className="rounded-xl border border-border bg-card shadow-sm"
          >
            <summary className="cursor-pointer list-none p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{entry.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.actor ? entry.actor.name : "System"} &middot;{" "}
                    {entry.targetType} &middot;{" "}
                    <span className="font-mono">{entry.targetId}</span>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDhakaDate(entry.createdAt)} &middot;{" "}
                  {formatDhakaTime(entry.createdAt)}
                </p>
              </div>
            </summary>

            <div className="space-y-3 border-t border-border p-3">
              <div className="space-y-1">
                <p className="text-xs font-medium">Before</p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-2 text-xs">
                  {entry.beforeJson === null
                    ? "-"
                    : JSON.stringify(entry.beforeJson, null, 2)}
                </pre>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">After</p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-2 text-xs">
                  {entry.afterJson === null
                    ? "-"
                    : JSON.stringify(entry.afterJson, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
