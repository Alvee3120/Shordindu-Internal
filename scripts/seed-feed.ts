import { PrismaClient, Role, UserStatus } from "@prisma/client";

/**
 * Feed performance data:
 *   npm run seed:feed        # 400 demo users x 25 days = 10,000 updates
 *   npm run seed:feed:clear  # removes demo users and their updates
 *
 * Demo accounts have no password, so they cannot be used to sign in.
 */

const prisma = new PrismaClient();

const DEMO_EMAIL_PREFIX = "feed-demo-";
const USER_COUNT = 400;
const DAYS = 25;
const DEPARTMENTS = [
  "Admin",
  "HR",
  "Supply Chain",
  "IT",
  "Finance",
  "Customer Care",
];
const TOPICS = [
  "shipping",
  "inventory",
  "invoice",
  "customer support",
  "supplier follow-up",
  "warehouse",
  "delivery",
  "monthly report",
];

function pad(value: number, length = 3): string {
  return String(value).padStart(length, "0");
}

function updateDate(dayOffset: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - dayOffset);
  return date;
}

async function clear() {
  const demoUsers = await prisma.user.findMany({
    where: { email: { startsWith: DEMO_EMAIL_PREFIX } },
    select: { id: true },
  });
  const ids = demoUsers.map((user) => user.id);
  if (ids.length === 0) {
    console.log("[SEED-FEED] No demo users to remove.");
    return;
  }

  const updates = await prisma.update.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: updates.map((update) => update.id) } },
  });
  await prisma.update.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(
    `[SEED-FEED] Removed ${ids.length} demo users and ${updates.length} updates.`,
  );
}

async function seed() {
  const startedAt = Date.now();

  const users = Array.from({ length: USER_COUNT }, (_, index) => {
    const number = index + 1;
    const department = DEPARTMENTS[index % DEPARTMENTS.length]!;
    return {
      name: `Demo User ${pad(number)}`,
      email: `${DEMO_EMAIL_PREFIX}${pad(number)}@example.com`,
      department,
      position: `Demo ${department} Staff`,
      role: Role.Employee,
      status: UserStatus.Active,
      emailVerifiedAt: new Date(),
    };
  });

  await prisma.user.createMany({ data: users, skipDuplicates: true });
  const savedUsers = await prisma.user.findMany({
    where: { email: { startsWith: DEMO_EMAIL_PREFIX } },
    select: { id: true, department: true, name: true },
  });

  const rows: {
    userId: string;
    contentHtml: string;
    contentText: string;
    updateDate: Date;
    postedAt: Date;
    isLate: boolean;
  }[] = [];

  for (let userIndex = 0; userIndex < savedUsers.length; userIndex++) {
    const user = savedUsers[userIndex]!;
    for (let day = 0; day < DAYS; day++) {
      const date = updateDate(day);
      const topic = TOPICS[(userIndex + day) % TOPICS.length]!;
      const items = ((userIndex + 1) * (day + 3)) % 40;
      const text = `${user.department}: ${topic} handled today - reviewed ${items} records and shared the status with the team.`;
      rows.push({
        userId: user.id,
        contentHtml: `<p>${text}</p>`,
        contentText: text,
        updateDate: date,
        postedAt: new Date(date.getTime() + 12 * 60 * 60 * 1000),
        isLate: false,
      });
    }
  }

  for (let offset = 0; offset < rows.length; offset += 1000) {
    await prisma.update.createMany({
      data: rows.slice(offset, offset + 1000),
      skipDuplicates: true,
    });
  }

  console.log(
    `[SEED-FEED] Created ${savedUsers.length} demo users with ${rows.length} updates in ${Date.now() - startedAt}ms.`,
  );
}

async function main() {
  if (process.argv.includes("--clear")) {
    await clear();
  } else {
    await seed();
  }
}

main()
  .catch((error) => {
    console.error("[SEED-FEED] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
