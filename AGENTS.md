# AGENTS.md

## Project

Internal company website (text only, no file uploads) for 50 to 80 users. Features: daily updates, comments, reactions, @mentions, tasks and assignments, leave and holidays, email notifications, audit log.
Stack: Next.js (App Router) + TypeScript, PostgreSQL + Prisma, Tailwind + shadcn/ui, TipTap (text-only), TanStack Query, pg-boss, Luxon, Zod, sanitize-html.

## Read first, every session

1. `docs/MASTER_PROMPT.md` is the full spec. It is the source of truth.
2. `docs/PROGRESS.md` shows which module is done and which is current.
3. `docs/DECISIONS.md` has my answers and approved changes. Do not ask again about anything listed there.

## Working rules

- Work on ONE module at a time, in order. Never start the next module on your own.
- When a module is finished, stop and send a Review Report (format in section 9 of the master prompt). Then wait for me to reply `APPROVED: Module N`.
- If something is unclear or conflicts with the spec, ask me before building. Do not guess business rules.
- Do not add features that are not in the spec. Put ideas under 'Suggestions' in the report.
- After I approve a module, update `docs/PROGRESS.md`. Record any new decision in `docs/DECISIONS.md`.

## Non-negotiable rules

- Timezone is Asia/Dhaka. Store UTC. Calculate 'the day' only through the shared time utility in `lib/time`. Never use the browser's timezone.
- Edit lock: updates and comments can be edited or deleted only on the same Dhaka calendar day they were created. Commenting and reactions are never locked.
- Enforce all permissions and locks on the server, never only in the UI.
- Roles (Admin, HR, Manager, Employee) control permissions. Position is free text for display only. Only an Admin can grant the Admin role.
- Text only. Sanitize all rich text on the server. Reject images, media, iframes, scripts, and files.
- Soft delete only. Log every create, edit, delete, approval, and role change to the audit log.
- Validate every input with Zod. Send emails only through the queue, never inside a web request.

## Code style

- TypeScript strict. Keep code simple and commented where logic is not obvious.
- Reuse shared helpers in `lib/` (time, sanitize, permissions, audit, email). Do not duplicate logic.
- Write tests for every business rule you implement, using a fake clock for date rules.
- Never commit secrets. Keep `.env.example` up to date.
