"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/auth/field";
import { useToast } from "@/components/ui/toast";
import { callApi, callApiJson, fetchJson } from "@/components/api-client";
import { cn } from "@/lib/utils";
import { formatDhakaDate } from "@/lib/time";
import type {
  CalendarEventDto,
  CalendarItemDto,
} from "@/components/calendar/types";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Parses YYYY-MM-DD into a UTC date, so the browser's timezone never shifts the day. */
function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekday(date: Date): number {
  // getUTCDay: Sunday = 0. Shift so Monday = 1 ... Sunday = 7.
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** First and last day of the month containing `dateString`. */
function monthBounds(dateString: string): { from: string; to: string } {
  const date = toUtcDate(dateString);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    from: toDateString(new Date(Date.UTC(year, month, 1))),
    to: toDateString(new Date(Date.UTC(year, month + 1, 0))),
  };
}

function shiftMonth(dateString: string, delta: number): string {
  const date = toUtcDate(dateString);
  return toDateString(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1)),
  );
}

/**
 * The visible grid: whole weeks (Monday first) covering the month, so the
 * first and last rows may include days from the neighbouring months.
 */
function buildGrid(dateString: string): string[] {
  const { from, to } = monthBounds(dateString);
  const first = toUtcDate(from);
  const last = toUtcDate(to);

  const lead = isoWeekday(first) - 1;
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - lead);

  const trail = 7 - isoWeekday(last);
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + trail);

  const days: string[] = [];
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    days.push(toDateString(cursor));
  }
  return days;
}

export function CalendarView({ today }: { today: string }) {
  const toast = useToast();
  const [monthAnchor, setMonthAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [items, setItems] = useState<CalendarItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const grid = useMemo(() => buildGrid(monthAnchor), [monthAnchor]);
  const { from, to } = useMemo(() => monthBounds(monthAnchor), [monthAnchor]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{ items: CalendarItemDto[] }>(
      `/api/calendar?from=${from}&to=${to}`
    );
    setLoading(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load your calendar.");
      return;
    }

    setError(null);
    setItems(result.data.items);
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItemDto[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  const selectedItems = byDate.get(selected) ?? [];

  function resetForm() {
    setTitle("");
    setNotes("");
    setEditingId(null);
    setAdding(false);
  }

  function startAdd() {
    setEditingId(null);
    setTitle("");
    setNotes("");
    setAdding(true);
  }

  function startEdit(item: CalendarItemDto) {
    const eventId = item.id.replace(/^event:/, "");
    setAdding(false);
    setEditingId(eventId);
    setTitle(item.title);
    setNotes(item.notes ?? "");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 2) {
      setError("Enter a title.");
      return;
    }

    setSaving(true);
    const result = editingId
      ? await callApiJson<{ event: CalendarEventDto }>(
          `/api/calendar/${editingId}`,
          "PATCH",
          { title: title.trim(), notes: notes.trim() || null, date: selected }
        )
      : await callApiJson<{ event: CalendarEventDto }>(
          "/api/calendar",
          "POST",
          { title: title.trim(), notes: notes.trim() || null, date: selected }
        );
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? "Could not save the entry.");
      return;
    }

    toast.show(editingId ? "Entry updated." : "Added to your calendar.", "success");
    resetForm();
    await load();
  }

  async function toggleDone(item: CalendarItemDto) {
    const eventId = item.id.replace(/^event:/, "");
    const result = await callApiJson<{ event: CalendarEventDto }>(
      `/api/calendar/${eventId}/done`,
      "POST",
      { done: !item.done }
    );

    if (!result.ok) {
      toast.show(result.error ?? "Could not update the entry.", "error");
      return;
    }

    toast.show(item.done ? "Moved back to open." : "Marked as done.", "success");
    await load();
  }

  async function remove(item: CalendarItemDto) {
    if (!window.confirm(`Delete "${item.title}" from your calendar?`)) return;

    const eventId = item.id.replace(/^event:/, "");
    const result = await callApi(`/api/calendar/${eventId}`, "DELETE");
    if (!result.ok) {
      toast.show(result.error ?? "Could not delete the entry.", "error");
      return;
    }

    toast.show("Entry deleted.", "success");
    await load();
  }

  const monthLabel = (() => {
    const date = toUtcDate(monthAnchor);
    return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  })();

  const showForm = adding || editingId !== null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">My Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Your own entries and assignment due dates. Reminders are emailed at
            10:30 AM on the day.
          </p>
        </div>
        <Button onClick={startAdd} variant={adding ? "outline" : "default"}>
          <Plus className="mr-1.5 h-4 w-4" />
          {adding ? "Close" : "Add entry"}
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="pt-4 sm:pt-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                onClick={() => setMonthAnchor(shiftMonth(monthAnchor, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="text-sm font-semibold">{monthLabel}</p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next month"
                onClick={() => setMonthAnchor(shiftMonth(monthAnchor, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAY_HEADERS.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.map((day) => {
                const dayItems = byDate.get(day) ?? [];
                const inMonth = day.slice(0, 7) === monthAnchor.slice(0, 7);
                const isToday = day === today;
                const isSelected = day === selected;
                const hasAssignment = dayItems.some(
                  (item) => item.kind === "assignment"
                );
                // A done entry keeps its record but no longer fills the day.
                const hasOpenItems = dayItems.some((item) => !item.done);
                const hasItems = hasOpenItems;
                const hasDoneOnly = dayItems.length > 0 && !hasOpenItems;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelected(day)}
                    aria-label={
                      hasItems
                        ? `${formatDhakaDate(day)}, ${dayItems.length} item${
                            dayItems.length === 1 ? "" : "s"
                          }`
                        : formatDhakaDate(day)
                    }
                    aria-current={isSelected ? "date" : undefined}
                    className={cn(
                      "flex min-h-16 flex-col gap-1 rounded-md border p-1.5 text-left transition",
                      // The whole cell is filled when something is still open on
                      // that day: amber for an assignment, pine for own entries.
                      // Done entries fall back to a normal, unfilled day.
                      hasAssignment
                        ? "border-gold/60 bg-gold/30 hover:bg-gold/40"
                        : hasOpenItems
                          ? "border-primary/20 bg-primary/10 hover:bg-primary/15"
                          : "border-transparent hover:bg-secondary",
                      isSelected && "ring-2 ring-primary ring-offset-1",
                      !inMonth && "opacity-40"
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                          isToday && "bg-primary text-primary-foreground"
                        )}
                      >
                        {Number(day.slice(8, 10))}
                      </span>
                      {hasDoneOnly ? (
                        <Check
                          className="h-3 w-3 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-primary/20 bg-primary/10" />
                Your entry
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-gold/60 bg-gold/30" />
                Assignment due
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3 w-3" aria-hidden />
                Done (kept in history)
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 pt-4 sm:pt-5">
              <div>
                <p className="text-sm font-semibold">
                  {formatDhakaDate(selected)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedItems.length === 0
                    ? "Nothing on this day"
                    : `${selectedItems.length} item${
                        selectedItems.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>

              {showForm ? (
                <form onSubmit={save} className="space-y-2">
                  <Field
                    id="calendar-title"
                    label="Title"
                    value={title}
                    maxLength={160}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={saving}
                    required
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="calendar-notes"
                      className="text-sm font-medium"
                    >
                      Notes (optional)
                    </label>
                    <textarea
                      id="calendar-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={2}
                      maxLength={2000}
                      disabled={saving}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? "Saving..." : editingId ? "Save" : "Add"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetForm}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <section className="space-y-2">
            {loading && items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : null}

            {!loading && selectedItems.length === 0 && !showForm ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing on this day"
                description="Add your own entry, or pick a day with an assignment."
              />
            ) : null}

            {selectedItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "space-y-1 rounded-xl border border-border bg-card p-3 shadow-sm",
                  item.done && "opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          item.done && "line-through"
                        )}
                      >
                        {item.title}
                      </p>
                      {item.kind === "assignment" ? (
                        <Badge variant="overdue">
                          <ClipboardList className="mr-1 h-3 w-3" />
                          Assignment
                        </Badge>
                      ) : null}
                      {item.done ? <Badge variant="active">Done</Badge> : null}
                    </div>
                    {item.notes ? (
                      <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {item.notes}
                      </p>
                    ) : null}
                    {item.link ? (
                      <a
                        href={item.link}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open assignment
                      </a>
                    ) : null}
                  </div>

                  {item.canEdit ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant={item.done ? "ghost" : "secondary"}
                        size="icon"
                        className="h-7 w-7"
                        aria-label={
                          item.done
                            ? "Mark as not done"
                            : "Mark this entry as done"
                        }
                        title={item.done ? "Mark as not done" : "Done"}
                        onClick={() => void toggleDone(item)}
                      >
                        {item.done ? (
                          <RotateCcw className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Edit entry"
                        onClick={() => startEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete entry"
                        onClick={() => void remove(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
