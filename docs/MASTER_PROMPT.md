# Master Prompt: Internal Daily Update and Assignment System

Prepared for use with an AI coding agent. Paste everything below the line into your agent as the first message.

---

## 0. How you must work (read first)

You are a senior full-stack engineer building an internal company website from scratch. The work is split into numbered **modules**. Follow these rules strictly:

1. Work on **one module at a time**, in order. Never start the next module on your own.
2. When a module is finished, **stop** and send a **Review Report** (format in section 9).
3. Wait for me to reply `APPROVED: Module N` before starting Module N+1. If I reply with changes, fix them and send a new report.
4. If something is unclear or conflicts with these rules, **ask me before building**. Do not guess on business rules.
5. Keep code simple, typed (TypeScript strict), commented where logic is not obvious, and consistent in style.
6. Do not add features that are not in this prompt. If you think something is missing, list it under 'Suggestions' in your report instead of building it.
7. Every rule about locking, permissions and visibility must be enforced **on the server**, never only in the interface.

## 1. Project overview

An internal **website** (not a mobile app) for a company with about 50 to 80 users, mostly in Bangladesh. Each person posts a **daily update** at the end of the day describing what they did. Everyone can see everyone's updates and comment on them. There is also an **Assignment** section where anyone can write an instruction and assign it to one or more people. Everything is **text only**: no file uploads, no images, no media anywhere.

Main parts: registration with email OTP and admin approval, daily updates, a searchable feed, comments, emoji reactions, @mentions, email and on-site notifications, assignments, leave and holiday handling, a 'not submitted today' list, a 7 PM email reminder, and an admin audit log.

## 2. Fixed tech stack

Use exactly this unless I approve a change:

- **Next.js (App Router) + TypeScript**, one codebase for frontend and backend, runs as a normal Node.js server
- **PostgreSQL** with **Prisma** (migrations required)
- **Tailwind CSS + shadcn/ui**, **Lucide** icons, font Inter, light and dark mode, mobile-first responsive layout
- **TipTap** rich text editor in **text-only mode** (bold, italic, bullet and numbered lists, links, @mention; no images, video, embeds or file handling)
- **TanStack Query** for data fetching, with optimistic updates for comments and reactions
- **pg-boss** (PostgreSQL based) for background jobs: email queue and scheduled jobs. No Redis.
- **Luxon** for all date and timezone logic
- **sanitize-html** on the server for all rich text
- **Zod** for validating every input
- Email through an adapter: SMTP or Resend, selectable by environment variable. In development, print emails to the console.
- Custom passwordless email OTP auth with secure, HttpOnly session cookies. No third-party auth service.
- Must be deployable on a single small VPS with Docker and Nginx, and also runnable locally with Docker Compose for PostgreSQL.

## 3. Global business rules (apply to every module)

**Timezone.** The company timezone is `Asia/Dhaka` (UTC+6). Store all timestamps in UTC. Always calculate 'which day it is' in Asia/Dhaka. Put this logic in one shared utility and reuse it everywhere. Never compare dates in the browser's timezone.

**Roles and position.** Two separate fields:

- `role`: Admin, HR, Manager, Employee. Set only by an approver. Used for all permissions.
- `position`: free text typed by the user when applying (for example 'Supply Chain Executive'). For display only. Never use it for permissions.

**Departments (fixed list, editable by Admin later):** Admin, HR, Supply Chain, IT, Finance, Customer Care.

**Account status:** Pending, Active, Rejected, Disabled. Only Active users can use the site.

**Visibility.** Every Active user can see all updates, comments, reactions and assignments of everyone.

**Edit lock.** An item can be edited or deleted only on the same Asia/Dhaka calendar day it was created. From 12:00 AM Dhaka time it is locked. Applies to daily updates and to comments (each comment is judged by its own creation day). Assignments are **not** day-locked (see Module 9).

**Commenting and reactions are never locked**, even on locked updates.

**Edited mark.** Any update, comment or assignment that was changed shows 'Edited'. No version history is shown to users.

**Delete.** Soft delete only (hidden from users, kept in the database), allowed on the same day only for updates and comments.

**Late update.** Each update has an `update_date` (the day it is about) and a `posted_at`. If `update_date` is earlier than the Dhaka date of `posted_at`, show a **Late** badge. A late update can be edited only on the day it was posted. One update per user per `update_date`.

**Text only.** Reject or strip images, video, iframes, scripts and any file data on the server.

**Audit log.** Record who, what action, which item, before and after values, and time for every create, edit and delete, every approval and role change, and every assignment change. Visible to Admin only.

**Assumptions I am making (tell me if wrong in your first report):** assignment due date is optional; assignments are visible to everyone; users on leave still receive assignment emails but show an 'On leave' flag; the weekend is a setting that defaults to Friday only; sessions last 30 days.

## 4. Permission table

| Action                                         | Employee | Manager | HR  | Admin |
| ---------------------------------------------- | -------- | ------- | --- | ----- |
| Post update, comment, react, create assignment | Yes      | Yes     | Yes | Yes   |
| Edit or cancel own assignment                  | Yes      | Yes     | Yes | Yes   |
| Edit or cancel others' assignment              | No       | Yes     | Yes | Yes   |
| Approve or reject signups, add users, set role | No       | Yes     | Yes | Yes   |
| Grant the Admin role                           | No       | No      | No  | Yes   |
| Manage holidays                                | No       | No      | Yes | Yes   |
| Mark leave for others                          | No       | Yes     | Yes | Yes   |
| See audit log                                  | No       | No      | No  | Yes   |
| See 'Not submitted today' list                 | No       | Yes     | Yes | Yes   |

A Manager or HR user must never be able to create or promote someone to Admin.

## 5. Data model (starting point, refine in Module 1)

- **users**: id, name, email (unique), phone, department, position, role (nullable until approved), status, email\_verified\_at, created\_at
- **otp\_codes**: id, email, code\_hash, purpose (register / login), expires\_at, attempts, used\_at
- **sessions**: id, user\_id, token\_hash, expires\_at
- **updates**: id, user\_id, content\_html, content\_text (for search), update\_date, posted\_at, is\_late, edited\_at, deleted\_at
- **comments**: id, target\_type (update / assignment), target\_id, user\_id, content\_html, created\_at, edited\_at, deleted\_at
- **reactions**: id, target\_type (update / comment / assignment), target\_id, user\_id, emoji; unique per user, target and emoji
- **mentions**: id, comment\_id, mentioned\_user\_id
- **assignments**: id, created\_by, content\_html, due\_date (nullable), priority (normal / urgent), status (open / completed / cancelled), created\_at, edited\_at
- **assignment\_assignees**: assignment\_id, user\_id, status (pending / in\_progress / done), done\_note, done\_at, removed\_at
- **leaves**: id, user\_id, from\_date, to\_date, created\_by
- **holidays**: id, date, name
- **settings**: key, value (weekend days, reminder time)
- **notifications**: id, user\_id, type, message, link, read\_at, created\_at
- **email\_queue / pg-boss tables**: reliable email sending
- **audit\_log**: id, actor\_id, action, target\_type, target\_id, before\_json, after\_json, created\_at

Add indexes for: updates (update\_date, user\_id), comments (target\_type, target\_id), notifications (user\_id, read\_at), and a full-text search index on updates.content\_text.

## 6. Security rules (apply to every module)

- Hash OTP codes. Codes expire in 10 minutes. Limit attempts (5) and resends (for example 3 per 15 minutes) per email and per IP.
- Do not reveal whether an email exists in login error messages.
- Sessions in HttpOnly, Secure, SameSite cookies. Store only a hash of the session token.
- Sanitize all rich text on the server before saving. Allow only: p, br, strong, em, ul, ol, li, a (http, https, mailto only, with rel noopener), and a safe mention span.
- Validate all inputs with Zod. Check permissions in every API route or server action.
- Never trust the client for dates, user ids or roles.
- Keep secrets in environment variables. Provide a `.env.example`.

## 7. Modules

### Module 0: Project setup

**Goal:** a clean running skeleton.

- Create the Next.js TypeScript project, Tailwind, shadcn/ui, ESLint, Prettier.
- Docker Compose for local PostgreSQL. Prisma connected. `.env.example`.
- Folder structure: `app/`, `components/`, `lib/` (db, auth, time, sanitize, permissions, audit, email), `jobs/`, `prisma/`.
- A `/api/health` route that checks the database.
- README with run instructions. **Done when:** `npm run dev` shows a home page, and the health route returns OK.

### Module 1: Database and core utilities

**Goal:** schema and shared helpers that every later module reuses.

- Full Prisma schema from section 5, first migration, seed script (departments, one first Admin from environment variables).
- `lib/time`: `dhakaToday()`, `toDhakaDate(date)`, `isSameDhakaDay(a, b)`, `isWeekend()`, helper functions with unit tests.
- `lib/sanitize`: server rich text sanitizer plus a plain-text extractor for search, with tests that strip scripts, images and iframes.
- `lib/permissions`: one function per action in the permission table.
- `lib/audit`: `logAudit(...)` helper. **Done when:** migrations run, seed works, and unit tests pass.

### Module 2: Registration and login (OTP)

**Goal:** safe passwordless authentication.

- Register page: name, department (dropdown), position (free text), email, phone. Send OTP to email. Verify OTP. Set status Pending.
- Login page: email, OTP, session cookie. Logout.
- Pending, Rejected and Disabled users get a clear message and no access.
- OTP rate limits, expiry and hashing as in section 6. Email adapter with console output in development.
- Route protection (middleware plus server checks). **Done when:** a new user can register, verify, and see 'Waiting for approval'; an Active user can log in and out; rate limits work.

### Module 3: User approval and user management

**Goal:** approvers control who gets in.

- Pending requests list for Admin, HR and Manager. Approve (must choose role, can correct department and position) or reject. The user gets an email.
- Add user directly: name, email, department, position, role. The user receives an invite and logs in with OTP. Active immediately.
- Users list with search, edit role or department, disable or re-enable.
- Enforce: only Admin can grant the Admin role. Audit every change. **Done when:** the full approval flow works and the Admin-role rule is enforced on the server.

### Module 4: App shell and design system

**Goal:** the professional look, built once.

- Responsive layout: sidebar on desktop, bottom or top menu on mobile; links to Feed, My Updates, Assignments, Users (if allowed), Leave and Holidays, Audit (Admin).
- Notification bell placeholder, theme toggle, user menu.
- Reusable components: Avatar, user card (name, position, department), Badge variants (Late, Edited, On leave, Overdue, Urgent, status), EmptyState, Skeleton loaders, toast. **Done when:** all pages share the layout and look good on a phone-width screen and a desktop.

### Module 5: Daily updates

**Goal:** post, edit and delete updates with the lock rule.

- TipTap text-only editor component (reused later for comments and assignments).
- Create update: date defaults to today (user may pick a past date to post a late update). One per user per date; if it exists, open it for editing instead.
- Server computes `is_late`, `posted_at`, `content_text`.
- Edit and delete only when `isSameDhakaDay(now, posted_at)`. Otherwise return a clear 'Locked' error. Edited mark. Soft delete. Audit.
- Update card with name, position, department, time, Late and Edited badges. **Done when:** I can post, edit and delete today's update; editing is refused for an update posted on an earlier Dhaka day (prove it with a test that fakes the clock).

### Module 6: Feed, filters and search

**Goal:** fast browsing of everyone's updates.

- Feed defaults to today, newest first, with cursor-based infinite scroll.
- Filters: date (single date or range), person, department.
- Search by person name or keyword (PostgreSQL full-text search over content\_text), with highlighted results if easy.
- Proper indexes. Fast loading with skeletons. **Done when:** filters and search work together and stay fast with 10,000 seeded test updates.

### Module 7: Comments, reactions and mentions

**Goal:** the shared interaction system, built once for updates and assignments.

- Comments with `target_type` and `target_id`. Rich text (text-only). Always allowed, even on locked updates.
- Edit and delete own comment only on the comment's own Dhaka day. Edited mark. Soft delete.
- Emoji reactions (for example 👍 ✅ ❤️ 🎉) toggled on updates and comments, with counts and who reacted on hover.
- @mention: typing `@` suggests Active users; store mentions rows. Optimistic UI. **Done when:** comments and reactions work on updates, locked updates still accept comments, and the comment lock rule is tested.

### Module 8: Notifications and email queue

**Goal:** reliable email and on-site notifications.

- pg-boss set up. All emails go through the queue, never inside a web request. Retries on failure.
- On-site notifications: bell with unread count, list, mark read, click opens the item. Polling every 30 to 60 seconds.
- Notify on: comment on my update, comment on my assignment, @mention, assignment received, assignment status changed.
- Email batching: group several notifications for one person into a single digest email (for example every 15 to 30 minutes) to stay under email limits. OTP and approval emails send immediately.
- Never notify a person about their own action. **Done when:** comments and mentions create bell notifications and queued emails, with digest batching working.

### Module 9: Assignments

**Goal:** assign text instructions to one or more people.

- Create: rich text instruction, one or more assignees (or pick a department to expand into its members), optional due date, priority Normal or Urgent. Text only.
- Per-assignee status: Pending, In progress, Done, with an optional short note on Done. Overall assignment shows progress ('2 of 3 done') and becomes Completed when all are done.
- Creator can edit the text (Edited mark, no day lock) and add or remove assignees (added people notified; removed people marked removed).
- Delete only while nobody has started; after that use Cancel, which keeps the record.
- Admin, HR and Manager can edit, reassign or cancel any assignment.
- Overdue badge when past due and not completed.
- Views: Assigned to me, Assigned by me, All assignments with filters (person, department, status, due date).
- Reuse the Module 7 comments and reactions. Creator is notified when an assignee marks Done.
- Audit all assignment changes. **Done when:** the full lifecycle works for multiple assignees, with correct permissions and notifications.

### Module 10: Leave, holidays and 'Not submitted today'

**Goal:** accurate missing-update tracking.

- Weekend days setting (default Friday only), editable by Admin or HR.
- Holiday calendar (HR and Admin add, edit, delete).
- Leave: a user can mark their own leave for a date or range; Manager, HR and Admin can mark for others. Show an 'On leave' badge.
- 'Not submitted today' list (Manager, HR, Admin): Active users who have not posted today, excluding weekends, holidays and users on leave. Show it as a dashboard card and a page. **Done when:** the list is correct in tests covering a weekend, a holiday and a leave day.

### Module 11: Scheduled jobs and reminders

**Goal:** automatic reminders in Dhaka time.

- Daily job at **7:00 PM Asia/Dhaka**: skip weekends and holidays; email everyone who is Active, not on leave and has not posted today. Use the same logic as Module 10.
- Optional morning job at 9:00 AM: remind assignees of assignments due today.
- Jobs must be idempotent (no double sending if restarted). Log each run. **Done when:** I can trigger the job manually and see the correct recipients; the schedule is verified in Dhaka time.

### Module 12: Audit log and admin settings

**Goal:** accountability and configuration.

- Admin-only audit log page with filters (user, action, date) and pagination, showing before and after values.
- Admin settings page: departments, weekend days, reminder time. **Done when:** earlier actions appear correctly in the audit log and non-Admins cannot open it.

### Module 13: Testing, hardening and deployment

**Goal:** ready for real use.

- Automated tests: edit lock across midnight (Dhaka), late flag, permissions per role, Admin-role rule, OTP limits, sanitizer, not-submitted logic.
- Security review against section 6. Add security headers and rate limiting on sensitive routes.
- Dockerfile and Docker Compose for production, Nginx config with HTTPS notes, environment variable guide.
- Daily automatic PostgreSQL backup script with restore instructions.
- Final README: setup, deploy, backup, and how to add the first Admin. **Done when:** all tests pass and I can deploy on a fresh VPS by following the README.

## 8. Optional later (do not build unless I ask)

- Link an assignment inside a daily update by typing `#`.
- Weekly summary emails.
- Installable web app (PWA).

## 9. Review Report format (send after every module)

1. **Module name and status**
2. **What was built** (short list)
3. **Files added or changed** (main ones)
4. **How to test it** (exact steps and commands)
5. **Rules verified** (which business rules from this prompt you checked, and how)
6. **Assumptions you made**
7. **Known issues or limits**
8. **Suggestions** (ideas not built)
9. **Questions for me**

Then stop and wait.

## 10. Start now

Acknowledge that you understand the rules. In your reply, list any questions or conflicts you see in this prompt and your reading of the assumptions in section 3. Do **not** write code yet. After I answer, begin **Module 0** only.
