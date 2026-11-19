import { AssignmentStatus, AssigneeStatus, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { extractPlainText } from "@/lib/sanitize";
import type { SessionUser } from "@/lib/auth";

/**
 * Personal calendar.
 * Two things appear on a user's calendar:
 *  - their own entries (CalendarEvent), which they create, edit and delete
 *  - assignment due dates, where they are an active assignee
 * Assignments are read from the assignment table rather than copied here, so a
 * changed due date or a cancelled assignment never leaves a stale entry.
 * Reminders go out at 10:30 Asia/Dhaka on the day the item is due.
 */

export const CALENDAR_REMINDER_TIME = "10:30";

export type CalendarItemKind = "event" | "assignment";

export interface CalendarItem {
  /** Stable across kinds: `event:<id>` or `assignment:<id>`. */
  id: string;
  kind: CalendarItemKind;
  title: string;
  notes: string | null;
  /** Dhaka calendar date, YYYY-MM-DD. */
  date: string;
  /** True once the owner marked an entry as done. Assignment items are always false. */
  done: boolean;
  /** Only for events the viewer owns; assignment items are read-only. */
  canEdit: boolean;
  link: string | null;
}

export type CalendarFailure =
  | "not_found"
  | "forbidden"
  | "invalid_date"
  | "no_changes";

export type CalendarResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: CalendarFailure };

export function calendarError(reason: CalendarFailure): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "not_found":
      return { status: 404, message: "Calendar entry not found." };
    case "forbidden":
      return { status: 403, message: "You can only change your own calendar." };
    case "invalid_date":
      return { status: 400, message: "Choose a valid date." };
    case "no_changes":
      return { status: 400, message: "Nothing to update." };
  }
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface CalendarEventView {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  done: boolean;
  createdAt: Date;
  editedAt: Date | null;
}

function toEventView(event: {
  id: string;
  title: string;
  notes: string | null;
  eventDate: Date;
  doneAt: Date | null;
  createdAt: Date;
  editedAt: Date | null;
}): CalendarEventView {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    date: dateOnlyString(event.eventDate),
    done: event.doneAt !== null,
    createdAt: event.createdAt,
    editedAt: event.editedAt,
  };
}

/**
 * Everything on the viewer's calendar between two dates (inclusive).
 * Uncapped by default so a month view is always complete.
 */
export async function listCalendar(
  viewer: SessionUser,
  from: string,
  to: string,
): Promise<CalendarItem[]> {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);

  const [events, assignments] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        userId: viewer.id,
        deletedAt: null,
        eventDate: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.assignment.findMany({
      where: {
        deletedAt: null,
        status: AssignmentStatus.open,
        dueDate: { gte: fromDate, lte: toDate },
        assignees: {
          some: {
            userId: viewer.id,
            removedAt: null,
            status: { not: AssigneeStatus.done },
          },
        },
      },
      select: {
        id: true,
        contentHtml: true,
        dueDate: true,
        priority: true,
      },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const items: CalendarItem[] = events.map((event) => ({
    id: `event:${event.id}`,
    kind: "event",
    title: event.title,
    notes: event.notes,
    date: dateOnlyString(event.eventDate),
    done: event.doneAt !== null,
    canEdit: true,
    link: null,
  }));

  for (const assignment of assignments) {
    if (!assignment.dueDate) continue;
    const summary = extractPlainText(assignment.contentHtml);
    const title =
      summary.length > 80 ? `${summary.slice(0, 77)}...` : summary;
    items.push({
      id: `assignment:${assignment.id}`,
      kind: "assignment",
      title: assignment.priority === "urgent" ? `Urgent: ${title}` : title,
      notes: null,
      date: dateOnlyString(assignment.dueDate),
      done: false,
      canEdit: false,
      link: `/assignments#assignment-${assignment.id}`,
    });
  }

  // Merge by date, then title, so both kinds interleave predictably.
  return items.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}

export async function createCalendarEvent(
  actor: SessionUser,
  input: { title: string; notes?: string | null; date: string },
): Promise<CalendarResult<CalendarEventView>> {
  const eventDate = parseDateOnly(input.date);
  if (Number.isNaN(eventDate.getTime())) {
    return { ok: false, reason: "invalid_date" };
  }

  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: {
        userId: actor.id,
        title: input.title,
        notes: input.notes?.trim() || null,
        eventDate,
      },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "calendar.event_created",
        targetType: "calendar",
        targetId: event.id,
        afterJson: {
          title: input.title,
          notes: event.notes,
          date: input.date,
        },
      },
      tx,
    );
    return event;
  });

  return { ok: true, data: toEventView(created) };
}

export async function updateCalendarEvent(
  actor: SessionUser,
  eventId: string,
  input: { title?: string; notes?: string | null; date?: string },
): Promise<CalendarResult<CalendarEventView>> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!event || event.deletedAt) return { ok: false, reason: "not_found" };
  if (event.userId !== actor.id) return { ok: false, reason: "forbidden" };

  const data: {
    title?: string;
    notes?: string | null;
    eventDate?: Date;
    editedAt: Date;
    remindedAt?: null;
  } = { editedAt: new Date() };

  if (input.title !== undefined) data.title = input.title;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  if (input.date !== undefined) {
    const eventDate = parseDateOnly(input.date);
    if (Number.isNaN(eventDate.getTime())) {
      return { ok: false, reason: "invalid_date" };
    }
    if (dateOnlyString(eventDate) !== dateOnlyString(event.eventDate)) {
      data.eventDate = eventDate;
      // Moving an entry to a new day makes it eligible for a fresh reminder.
      data.remindedAt = null;
    }
  }

  if (
    data.title === undefined &&
    data.notes === undefined &&
    data.eventDate === undefined
  ) {
    return { ok: false, reason: "no_changes" };
  }

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.calendarEvent.update({
      where: { id: eventId },
      data,
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "calendar.event_edited",
        targetType: "calendar",
        targetId: eventId,
        beforeJson: {
          title: event.title,
          notes: event.notes,
          date: dateOnlyString(event.eventDate),
        },
        afterJson: {
          title: updated.title,
          notes: updated.notes,
          date: dateOnlyString(updated.eventDate),
        },
      },
      tx,
    );
    return updated;
  });

  return { ok: true, data: toEventView(saved) };
}

/**
 * Marks an entry done (or undone). A done entry keeps its record and stays
 * visible when that day is selected, but stops filling the day in the grid.
 */
export async function setCalendarEventDone(
  actor: SessionUser,
  eventId: string,
  done: boolean,
): Promise<CalendarResult<CalendarEventView>> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!event || event.deletedAt) return { ok: false, reason: "not_found" };
  if (event.userId !== actor.id) return { ok: false, reason: "forbidden" };

  const doneAt = done ? new Date() : null;
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.calendarEvent.update({
      where: { id: eventId },
      data: { doneAt, editedAt: new Date() },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: done ? "calendar.event_done" : "calendar.event_reopened",
        targetType: "calendar",
        targetId: eventId,
        beforeJson: { done: event.doneAt !== null },
        afterJson: { done },
      },
      tx,
    );
    return updated;
  });

  return { ok: true, data: toEventView(saved) };
}

export async function deleteCalendarEvent(
  actor: SessionUser,
  eventId: string,
): Promise<CalendarResult<{ id: string }>> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!event || event.deletedAt) return { ok: false, reason: "not_found" };
  if (event.userId !== actor.id) return { ok: false, reason: "forbidden" };

  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: eventId },
      data: { deletedAt: new Date() },
    });
    await logAudit(
      {
        actorId: actor.id,
        action: "calendar.event_deleted",
        targetType: "calendar",
        targetId: eventId,
        beforeJson: {
          title: event.title,
          date: dateOnlyString(event.eventDate),
        },
      },
      tx,
    );
  });

  return { ok: true, data: { id: eventId } };
}

export interface DueCalendarEvent {
  id: string;
  title: string;
  notes: string | null;
  user: { id: string; name: string; email: string };
}

/**
 * Personal entries due on the given Dhaka date that have not been reminded yet.
 * Assignments send their own reminder, so they are not included here. An entry
 * already marked done needs no reminder.
 */
export async function dueCalendarEvents(
  dateString: string,
): Promise<DueCalendarEvent[]> {
  const eventDate = parseDateOnly(dateString);
  return prisma.calendarEvent.findMany({
    where: {
      eventDate,
      deletedAt: null,
      remindedAt: null,
      doneAt: null,
      user: { status: UserStatus.Active },
    },
    select: {
      id: true,
      title: true,
      notes: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Marks the given entries as reminded so a re-run never sends twice. */
export async function markCalendarReminded(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.calendarEvent.updateMany({
    where: { id: { in: ids } },
    data: { remindedAt: new Date() },
  });
}
