import { PrismaClient, Role, UserStatus } from "@prisma/client";
import { DEFAULT_DEPARTMENTS } from "../lib/constants";

const prisma = new PrismaClient();

const DEFAULT_SETTINGS = {
  departments: DEFAULT_DEPARTMENTS,
  weekend_days: [5],
  reminder_time: "19:00",
};

async function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: JSON.stringify(value) },
    });
  }
  console.log("[SEED] Settings ready:", Object.keys(DEFAULT_SETTINGS).join(", "));
}

async function seedFirstAdmin() {
  const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.FIRST_ADMIN_NAME?.trim() || "System Administrator";

  if (!email) {
    console.warn("[SEED] FIRST_ADMIN_EMAIL is not set, skipping first Admin.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[SEED] User ${email} already exists, skipping.`);
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      department: "Admin",
      position: "System Administrator",
      role: Role.Admin,
      status: UserStatus.Active,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`[SEED] First Admin created: ${email}`);
}

async function main() {
  await seedSettings();
  await seedFirstAdmin();
}

main()
  .catch((error) => {
    console.error("[SEED] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
