import { PrismaClient } from "@prisma/client";

/**
 * Demo chat for manual testing:
 *   npm run seed:chat        # clears the room and posts ~35 messages
 *   npm run seed:chat:clear  # clears the room only
 *
 * Messages are posted by whichever of the four named people exist in the
 * database, so there is nothing to configure. Mentions are stored in the same
 * `@[Name](id)` format the chat UI produces.
 */

const prisma = new PrismaClient();

const PEOPLE = ["Alvee", "Nusrat", "Ezaz", "Rifat"];

interface Line {
  /** Matched against User.name, so "Rifat" finds "Rifat Tanbir". */
  author: string;
  text: string;
  /** How many minutes after the previous message. */
  gapMinutes: number;
}

/**
 * A plausible working conversation, oldest first. Gaps add up to roughly one
 * and a half working days so the day separators in the UI are visible.
 */
const SCRIPT: Line[] = [
  { author: "Rifat", text: "Morning everyone. Standup notes by 11 today please.", gapMinutes: 0 },
  { author: "Nusrat", text: "Morning! Will post mine right after the supplier call.", gapMinutes: 4 },
  { author: "Alvee", text: "Same here, just finishing the inventory sheet.", gapMinutes: 3 },
  { author: "Ezaz", text: "Anyone else seeing the delayed shipment from Chattogram?", gapMinutes: 6 },
  { author: "Rifat", text: "Yes, port congestion. I have asked the agent for an ETA.", gapMinutes: 2 },
  { author: "Nusrat", text: "The customer is asking about it. Can I promise Friday?", gapMinutes: 5 },
  { author: "Ezaz", text: "Friday should be fine if it clears today.", gapMinutes: 3 },
  { author: "Alvee", text: "I will add a note on the order so support can see it.", gapMinutes: 7 },
  { author: "Rifat", text: "{@Nusrat} keep it in the assignment so we do not lose track.", gapMinutes: 2 },
  { author: "Nusrat", text: "Done. Also flagged the invoice for review.", gapMinutes: 11 },
  { author: "Ezaz", text: "Lunch? I am heading down in ten.", gapMinutes: 14 },
  { author: "Alvee", text: "Give me fifteen, still on the phone.", gapMinutes: 1 },
  { author: "Rifat", text: "{@Nusrat} the monthly report draft looks good. One typo on page two.", gapMinutes: 26 },
  { author: "Nusrat", text: "Fixed, thanks for catching it.", gapMinutes: 4 },
  { author: "Ezaz", text: "Agent confirmed Friday morning arrival.", gapMinutes: 18 },
  { author: "Rifat", text: "Great news. Support can tell the customer.", gapMinutes: 2 },
  { author: "Alvee", text: "Order note updated and tagged.", gapMinutes: 6 },
  { author: "Nusrat", text: "I will email the customer now.", gapMinutes: 3 },
  { author: "Ezaz", text: "Anyone got the warehouse contact number? Lost it.", gapMinutes: 9 },
  { author: "Alvee", text: "{@Ezaz} sent it to your email just now.", gapMinutes: 2 },
  { author: "Ezaz", text: "Got it, thanks.", gapMinutes: 1 },
  // Next working day.
  { author: "Nusrat", text: "Morning. Any updates overnight?", gapMinutes: 900 },
  { author: "Rifat", text: "Shipment cleared customs. Should reach us by noon.", gapMinutes: 5 },
  { author: "Alvee", text: "I will get the receiving team ready.", gapMinutes: 3 },
  { author: "Ezaz", text: "Do we need extra space in the warehouse?", gapMinutes: 4 },
  { author: "Alvee", text: "Checked this morning, we have room for both pallets.", gapMinutes: 2 },
  { author: "Rifat", text: "Good. Let us keep the same assignments open until it is received.", gapMinutes: 6 },
  { author: "Nusrat", text: "Customer replied, they are happy with Friday.", gapMinutes: 12 },
  { author: "Ezaz", text: "Truck is at the gate.", gapMinutes: 21 },
  { author: "Alvee", text: "Coming down now.", gapMinutes: 1 },
  { author: "Rifat", text: "Received and checked. Everything intact.", gapMinutes: 17 },
  { author: "Nusrat", text: "Closing the customer email thread then.", gapMinutes: 4 },
  { author: "Ezaz", text: "I will mark the assignment done.", gapMinutes: 2 },
  { author: "Alvee", text: "Reminder: leave requests for December close end of this week.", gapMinutes: 15 },
  { author: "Rifat", text: "Good point. Please put yours in early, approvals take a day.", gapMinutes: 3 },
  { author: "Nusrat", text: "{@Alvee} submitting mine today.", gapMinutes: 6 },
];

/** Picks the stored user for a first name like "Rifat". */
function findUser(
  users: { id: string; name: string }[],
  first: string,
): { id: string; name: string } | null {
  const lower = first.toLowerCase();
  return (
    users.find((user) => user.name.toLowerCase() === lower) ??
    users.find((user) => user.name.toLowerCase().startsWith(lower)) ??
    null
  );
}

/**
 * Turns `@{Nusrat}` into the stored mention token `@[Nusrat](id)`, using the
 * real user id, so the chat renders it highlighted and links the mention row.
 */
function expandMentions(
  text: string,
  users: { id: string; name: string }[],
): { content: string; mentionedIds: string[] } {
  const mentionedIds: string[] = [];
  const content = text.replace(/\{@([A-Za-z ]+)\}/g, (_match, first: string) => {
    const user = findUser(users, first.trim());
    if (!user) return `@${first.trim()}`;
    mentionedIds.push(user.id);
    const label = user.name.split(" ")[0] ?? user.name;
    return `@[${label}](${user.id})`;
  });
  return { content, mentionedIds };
}

async function clearChat(): Promise<number> {
  // Mentions point at chat messages through a polymorphic reference with no
  // foreign key, so they are cleared explicitly rather than by cascade.
  await prisma.mention.deleteMany({ where: { targetType: "chatMessage" } });
  const deleted = await prisma.chatMessage.deleteMany({});
  await prisma.chatRead.deleteMany({});
  return deleted.count;
}

async function main() {
  const clearOnly = process.argv.includes("--clear");

  const removed = await clearChat();
  console.log(`Cleared ${removed} message(s).`);
  if (clearOnly) return;

  const users = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const authors: { id: string; name: string }[] = [];
  for (const person of PEOPLE) {
    const match = findUser(users, person);
    if (match) {
      authors.push(match);
    } else {
      console.warn(`Skipping "${person}": no such user in the database.`);
    }
  }
  if (authors.length === 0) {
    throw new Error("None of the seed authors exist. Create those users first.");
  }

  // Start far enough back that the whole script lands in the past.
  const totalMinutes = SCRIPT.reduce((sum, line) => sum + line.gapMinutes, 0);
  let cursor = Date.now() - totalMinutes * 60_000;

  const rows: {
    id: string;
    userId: string;
    content: string;
    createdAt: Date;
  }[] = [];
  const mentionRows: {
    targetType: "chatMessage";
    targetId: string;
    mentionedUserId: string;
  }[] = [];

  for (const line of SCRIPT) {
    const author = findUser(authors, line.author);
    if (!author) continue;

    cursor += line.gapMinutes * 60_000;
    const id = crypto.randomUUID();
    const { content, mentionedIds } = expandMentions(line.text, authors);

    rows.push({
      id,
      userId: author.id,
      content,
      createdAt: new Date(cursor),
    });

    for (const mentionedUserId of mentionedIds) {
      mentionRows.push({
        targetType: "chatMessage",
        targetId: id,
        mentionedUserId,
      });
    }
  }

  // Insert with explicit timestamps and ids so mentions can be linked after.
  for (const row of rows) {
    await prisma.chatMessage.create({ data: row });
  }
  if (mentionRows.length > 0) {
    await prisma.mention.createMany({ data: mentionRows });
  }

  // Reset everyone's read marker to the start, so the unread badge shows a
  // sensible number rather than zero.
  await prisma.chatRead.deleteMany({});
  await prisma.chatRead.createMany({
    data: authors.map((author) => ({
      userId: author.id,
      lastReadAt: rows[0]?.createdAt ?? new Date(),
    })),
    skipDuplicates: true,
  });

  console.log(
    `Seeded ${rows.length} messages from ${authors
      .map((author) => author.name)
      .join(", ")}, with ${mentionRows.length} mention(s).`,
  );
}

main()
  .catch((error) => {
    console.error("[SEED CHAT] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
