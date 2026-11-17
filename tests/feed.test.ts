import { afterAll, describe, expect, it } from "vitest";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decodeCursor, encodeCursor, getFeed } from "@/lib/feed";

const createdUserIds: string[] = [];

function uniqueEmail(label: string): string {
  return `feed-test-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
}

async function createAuthor(
  name: string,
  department: string,
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      name,
      email: uniqueEmail(name.replace(/\s+/g, "-").toLowerCase()),
      department,
      position: "Tester",
      role: Role.Employee,
      status: UserStatus.Active,
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function addUpdate(
  userId: string,
  {
    date,
    postedAt,
    text,
    deleted = false,
  }: {
    date: string;
    postedAt: string;
    text: string;
    deleted?: boolean;
  },
): Promise<string> {
  const update = await prisma.update.create({
    data: {
      userId,
      contentHtml: `<p>${text}</p>`,
      contentText: text,
      updateDate: new Date(`${date}T00:00:00.000Z`),
      postedAt: new Date(postedAt),
      isLate: false,
      deletedAt: deleted ? new Date() : null,
    },
  });
  return update.id;
}

afterAll(async () => {
  await prisma.update.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("feed cursors", () => {
  it("round-trips an encoded cursor", () => {
    const cursor = {
      d: "2026-11-17",
      p: "2026-11-17T12:00:00.000Z",
      i: "00000000-0000-4000-8000-000000000000",
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("{}").toString("base64url"))).toBeNull();
  });
});

describe("getFeed", () => {
  it("returns only the requested day, newest post first", async () => {
    const first = await createAuthor("Feed Alpha", "IT");
    const second = await createAuthor("Feed Beta", "Finance");
    const token = `daily${Date.now().toString(36)}`;

    await addUpdate(first, {
      date: "2026-11-17",
      postedAt: "2026-11-17T10:00:00Z",
      text: `Morning update ${token}`,
    });
    await addUpdate(second, {
      date: "2026-11-17",
      postedAt: "2026-11-17T13:00:00Z",
      text: `Afternoon update ${token}`,
    });
    await addUpdate(first, {
      date: "2026-11-16",
      postedAt: "2026-11-16T12:00:00Z",
      text: `Yesterday ${token}`,
    });

    const page = await getFeed({
      from: "2026-11-17",
      to: "2026-11-17",
      q: token,
    });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.contentHtml).toContain("Afternoon update");
    expect(page.items[1]?.contentHtml).toContain("Morning update");
  });

  it("filters by person and department", async () => {
    const it = await createAuthor("Filter IT", "IT");
    const finance = await createAuthor("Filter Finance", "Finance");
    await addUpdate(it, {
      date: "2026-11-17",
      postedAt: "2026-11-17T11:00:00Z",
      text: "IT only",
    });
    await addUpdate(finance, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:00:00Z",
      text: "Finance only",
    });

    const byPerson = await getFeed({ userId: it });
    expect(byPerson.items).toHaveLength(1);
    expect(byPerson.items[0]?.author.id).toBe(it);

    const byDepartment = await getFeed({ department: "Finance" });
    expect(byDepartment.items.some((item) => item.author.id === finance)).toBe(
      true,
    );
    expect(byDepartment.items.some((item) => item.author.id === it)).toBe(false);
    expect(
      byDepartment.items.every(
        (item) => item.author.department === "Finance",
      ),
    ).toBe(true);
  });

  it("filters by date range", async () => {
    const author = await createAuthor("Range Tester", "IT");
    await addUpdate(author, {
      date: "2026-11-15",
      postedAt: "2026-11-15T12:00:00Z",
      text: "Day 15",
    });
    await addUpdate(author, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:00:00Z",
      text: "Day 17",
    });

    const page = await getFeed({
      from: "2026-11-16",
      to: "2026-11-17",
      userId: author,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.updateDate).toBe("2026-11-17");
  });

  it("searches keywords with highlighted snippets", async () => {
    const author = await createAuthor("Search Tester", "Supply Chain");
    await addUpdate(author, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:00:00Z",
      text: "Completed the shipping reconciliation for the supplier",
    });
    await addUpdate(author, {
      date: "2026-11-16",
      postedAt: "2026-11-16T12:00:00Z",
      text: "Worked on invoices",
    });

    const page = await getFeed({ q: "shipping", userId: author });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.headline).toContain("<mark>");
    expect(page.items[0]?.headline?.toLowerCase()).toContain("shipping");
  });

  it("searches by person name too", async () => {
    const author = await createAuthor("Zubair Mentionable", "IT");
    await addUpdate(author, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:00:00Z",
      text: "Nothing about the keyword here",
    });

    const page = await getFeed({ q: "zubair" });

    expect(page.items.some((item) => item.author.id === author)).toBe(true);
  });

  it("escapes HTML found in highlighted text", async () => {
    const author = await createAuthor("Escaper", "IT");
    await addUpdate(author, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:00:00Z",
      text: 'Report for <img src=x onerror=alert(1)> today',
    });

    const page = await getFeed({ q: "img", userId: author });

    expect(page.items).toHaveLength(1);
    const headline = page.items[0]?.headline ?? "";
    expect(headline).not.toContain("<img");
    expect(headline).toContain("&lt;");
    expect(headline).toContain("<mark>img</mark>");
  });

  it("paginates with a cursor without duplicates", async () => {
    const token = `pagination${Date.now().toString(36)}`;
    for (let index = 0; index < 5; index++) {
      const id = await createAuthor(`Pager ${index}`, "IT");
      await addUpdate(id, {
        date: "2026-11-17",
        postedAt: `2026-11-17T1${index}:00:00Z`,
        text: `Page item ${index} ${token}`,
      });
    }

    const seen: string[] = [];
    let cursor: ReturnType<typeof decodeCursor> = null;
    let pages = 0;

    do {
      const page = await getFeed({ q: token }, cursor, 2);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ? decodeCursor(page.nextCursor) : null;
      pages++;
    } while (cursor && pages < 20);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(pages).toBe(3);
  });

  it("excludes soft-deleted updates", async () => {
    const author = await createAuthor("Deleted Tester", "IT");
    await addUpdate(author, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:00:00Z",
      text: "Deleted update",
      deleted: true,
    });

    const page = await getFeed({ userId: author });
    expect(page.items).toHaveLength(0);
  });

  it("combines date, person, department and keyword filters", async () => {
    const target = await createAuthor("Combo Target", "Customer Care");
    const other = await createAuthor("Combo Other", "Customer Care");

    await addUpdate(target, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:00:00Z",
      text: "Handled delivery complaints",
    });
    await addUpdate(other, {
      date: "2026-11-17",
      postedAt: "2026-11-17T12:30:00Z",
      text: "Handled delivery complaints too",
    });

    const page = await getFeed({
      from: "2026-11-17",
      to: "2026-11-17",
      userId: target,
      department: "Customer Care",
      q: "delivery",
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.author.id).toBe(target);
  });
});
