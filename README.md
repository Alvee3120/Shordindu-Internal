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
- Docker and Docker Compose (or a local PostgreSQL 16 instance)

### 2. Environment Setup

Copy the example environment configuration:

```bash
cp .env.example .env
```

### 3. Start PostgreSQL Database

Using Docker Compose:

```bash
docker compose up -d
```

Or ensure your local PostgreSQL is running on port 5432 with database `shordindu_internal`.

### 4. Install Dependencies

```bash
npm install
```

### 5. Generate Prisma Client

```bash
npm run prisma:generate
```

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
├── app/                  # Next.js App Router (pages & API routes)
│   ├── api/health/       # Database & system health check endpoint
│   ├── globals.css       # Tailwind CSS & theme tokens
│   ├── layout.tsx        # Root HTML layout
│   └── page.tsx          # Home page
├── components/           # Reusable UI components
│   └── ui/               # shadcn/ui atomic components
├── lib/                  # Shared core utilities (Server-enforced)
│   ├── db.ts             # Prisma client singleton
│   ├── auth.ts           # Session & OTP security helpers
│   ├── time.ts           # Shared Asia/Dhaka time utilities
│   ├── sanitize.ts       # Server-side HTML sanitizer
│   ├── permissions.ts    # Role & permission checkers
│   ├── audit.ts          # Audit log recorder
│   ├── email.ts          # Email dispatch adapter
│   └── utils.ts          # shadcn styling utility
├── jobs/                 # pg-boss background jobs & crons
├── prisma/               # Prisma schema and migrations
├── docs/                 # Project documentation & decisions
├── docker-compose.yml    # Local PostgreSQL service
└── package.json          # Dependencies and scripts
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
