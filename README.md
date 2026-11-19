# Shordindu Internal

Internal company communication and assignment platform for 50–80 users.
Features daily updates, assignments, leave and holiday tracking, comments, reactions, and audit logging.

## Tech Stack

- **Framework:** Next.js (App Router) + TypeScript
- **Database & ORM:** PostgreSQL + Prisma ORM
- **Styling & UI:** Tailwind CSS, shadcn/ui, Lucide Icons
- **Timezone Management:** Luxon (Strictly `Asia/Dhaka` UTC+6)
- **Background Jobs & Email Queue:** pg-boss (PostgreSQL-backed)
- **Validation & Sanitization:** Zod, sanitize-html

---

## Getting Started

### 1. Prerequisites

- Node.js 18.18+ or 20+
- PostgreSQL 16 (local install or private cluster, no Docker needed for now)

### 2. Environment Setup

Copy the example environment configuration:

```bash
cp .env.example .env
```

### 3. Start PostgreSQL Database

Docker is not required at the moment. Use a local PostgreSQL 16 install, or the
private cluster below (no root required):

```bash
PGDATA="$HOME/.local/share/shordindu/pgdata"
export PATH="/usr/lib/postgresql/16/bin:$PATH"

initdb -D "$PGDATA" -U postgres --auth=trust --no-locale -E UTF8
pg_ctl -D "$PGDATA" -l "$HOME/.local/share/shordindu/pg.log" \
  -o "-k /tmp -p 5432 -c listen_addresses=''" start
createdb -h /tmp -U postgres shordindu_internal

# stop it later with:
pg_ctl -D "$PGDATA" stop
```

That cluster listens on the Unix socket only, so `.env` must use:

```dotenv
DATABASE_URL="postgresql://postgres@localhost/shordindu_internal?host=/tmp"
```

Docker Compose (later): `docker compose up -d`, then use the TCP URL from `.env.example`.

### 4. Install Dependencies

```bash
npm install
```

### 5. Prepare the Database

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The seeded Admin starts without a password. Open `/forgot-password`, enter the
Admin email, and set one — in development the reset code prints in the terminal.

### 6. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the home page.

---

## Verifying Health Check

The system includes an automated database health route:

- Endpoint: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- Returns JSON with database connectivity, latency, server uptime, and Dhaka date.

---

## Project Structure

```text
├── app/                     # Next.js App Router (pages & API routes)
│   ├── (app)/               # Signed-in area, wrapped by the app shell
│   │   ├── layout.tsx       # Session check + sidebar/header shell
│   │   ├── page.tsx         # Feed: filters, search and infinite scroll
│   │   ├── users/           # Approvals and user management
│   │   ├── my-updates/      # Post, edit and delete daily updates
│   │   ├── assignments/     # Assign, track status and filter assignments
│   │   ├── leave/           # Leave marking, holidays and weekend setting
│   │   ├── not-submitted/   # Active users missing today's update
│   │   ├── audit/           # Admin-only audit log with filters and paging
│   │   └── settings/        # Admin settings: departments, weekend, reminder
│   ├── api/auth/            # Register, login, logout, current user
│   ├── api/assignments/     # Create, edit, cancel, delete and status updates
│   ├── api/comments/        # Comment list, create, edit and soft delete
│   ├── api/feed/            # Filtered feed pages with cursor pagination
│   ├── api/holidays/        # Holiday calendar (HR and Admin manage)
│   ├── api/health/          # Database & system health check endpoint
│   ├── api/interactions/    # Reaction summary and comment count per card
│   ├── api/leaves/          # Mark and list leave
│   ├── api/notifications/   # Bell list, unread count and mark-read
│   ├── api/people/          # Active users for filters and @mentions
│   ├── api/reactions/       # Toggle reactions on updates/comments
│   ├── api/settings/        # Departments, weekend and reminder time endpoints
│   ├── api/updates/         # Create, read, edit and soft-delete updates
│   ├── api/users/           # Pending list, approve/reject, add and edit users
│   ├── login/               # Sign-in page (email + password)
│   ├── register/            # Registration page (password + email OTP)
│   ├── forgot-password/     # Self-service password reset (email OTP)
│   ├── globals.css          # Tailwind CSS, theme tokens and editor styles
│   └── layout.tsx           # Root layout, theme init and toasts
├── components/              # Reusable UI components
│   ├── api-client.ts        # JSON fetch helpers for client components
│   ├── assignments/         # Assignment form, cards and views
│   ├── attendance/          # Not-submitted dashboard card
│   ├── auth/                # Auth forms, fields and card
│   ├── editor/              # TipTap editor, mentions and content renderer
│   ├── feed/                # Feed with filters and infinite scroll
│   ├── interactions/        # Comments, reactions and card interaction bar
│   ├── layout/              # App shell, nav, user menu, theme toggle
│   ├── leave/               # Leave, holiday and weekend UI
│   ├── providers/           # Session context for client components
│   ├── settings/            # Admin settings form
│   ├── updates/             # Update composer and update cards
│   ├── users/               # Approval cards and user rows
│   └── ui/                  # Avatar, badge, card, empty state, skeleton, toast
├── middleware.ts            # Cookie gate that protects app routes
├── lib/                     # Shared core utilities (Server-enforced)
│   ├── db.ts                # Prisma client singleton
│   ├── auth.ts              # Session helpers and status messages
│   ├── password.ts          # scrypt password hashing
│   ├── login.ts             # Password login and failed-attempt limits
│   ├── api.ts               # API guards for signed-in approvers
│   ├── user-management.ts   # Approve, reject, add and edit users
│   ├── updates.ts           # Daily updates, late flag and same-day lock
│   ├── assignments.ts       # Assignment lifecycle, statuses and permissions
│   ├── announcements.ts     # Notice board: post, edit, delete and email everyone
│   ├── chat.ts              # Global group chat: send, edit, delete, mentions, paging
│   ├── calendar.ts          # Personal calendar: events, assignment due dates, reminders
│   ├── leaves.ts            # Leave marking and listing rules
│   ├── holidays.ts          # Holiday calendar management
│   ├── attendance.ts        # Not-submitted-today calculation
│   ├── interactions.ts      # Comments, reactions and interaction summaries
│   ├── mentions.ts          # Mention extraction and syncing
│   ├── reaction-emojis.ts   # Allowed reaction set shared by server and UI
│   ├── feed.ts              # Feed filters, full-text search and cursors
│   ├── otp.ts               # OTP issue/verify, hashing and rate limits
│   ├── time.ts              # Shared Asia/Dhaka time utilities
│   ├── sanitize.ts          # Server-side HTML sanitizer
│   ├── permissions.ts       # Role & permission checkers
│   ├── audit.ts             # Audit writer and filtered audit log queries
│   ├── settings.ts          # JSON settings reader (departments, etc.)
│   ├── validators.ts        # Zod input schemas
│   ├── email.ts             # Email transport adapter and templates
│   ├── mailer.ts            # Queues all outgoing email via pg-boss
│   ├── queue.ts             # pg-boss instance, workers and digest schedule
│   ├── notifications.ts     # In-app notifications for comments/mentions/assignments
│   └── utils.ts             # shadcn styling utility
├── jobs/                    # pg-boss background jobs & crons
│   ├── digest.ts            # Batches pending notifications into one email
│   └── reminders.ts         # Daily update and assignment-due reminders
├── prisma/                  # Prisma schema and migrations
├── scripts/                 # Dev helpers (seed, digest, manual reminders)
├── public/
│   └── logo.png             # Brand logo used by the shell and auth pages
├── docs/                    # Project documentation & decisions
├── docker-compose.yml       # Local PostgreSQL service (for later)
└── package.json             # Dependencies and scripts
```

---

## Scripts

- `npm run dev`: Start Next.js development server
- `npm run build`: Build production Next.js bundle
- `npm run start`: Start production server
- `npm run lint`: Run ESLint checks
- `npm run format`: Format code with Prettier
- `npm run test`: Run unit tests with Vitest
- `npm run prisma:generate`: Generate Prisma Client
- `npm run prisma:migrate`: Apply database migrations
- `npm run prisma:seed`: Seed departments, settings and the first Admin
- `npm run seed:feed`: Seed 10,000 demo updates for feed performance testing
- `npm run seed:feed:clear`: Remove the demo users and updates
- `npm run seed:chat`: Replace the group chat with ~36 demo messages between Alvee, Nusrat, Ezaz and Rifat
- `npm run seed:chat:clear`: Empty the group chat and its mentions/read markers
- `npm run digest`: Send the pending notification digest immediately (dev helper)
- `npm run reminder:daily`: Run the 7 PM update reminder now (idempotent per day)
- `npm run reminder:due`: Run the 9 AM assignment-due reminder now
