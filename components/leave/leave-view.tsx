"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Palmtree, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/auth/field";
import { useToast } from "@/components/ui/toast";
import { callApi, callApiJson, fetchJson } from "@/components/api-client";
import { formatDhakaDate } from "@/lib/time";
import type { PersonOptionDto } from "@/components/assignments/types";

interface LeaveDto {
  id: string;
  userId: string;
  name: string;
  department: string;
  position: string;
  fromDate: string;
  toDate: string;
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface HolidayDto {
  id: string;
  date: string;
  name: string;
  createdAt: string;
}

type Tab = "leave" | "holidays";

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

function datePart(value: string): string {
  return value.slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${datePart(from)}T00:00:00.000Z`).getTime();
  const end = new Date(`${datePart(to)}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function LeaveView({
  today,
  initialWeekendDays,
  canMarkForOthers,
  canManageHolidays,
  canManageWeekend,
}: {
  today: string;
  initialWeekendDays: number[];
  canMarkForOthers: boolean;
  canManageHolidays: boolean;
  canManageWeekend: boolean;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("leave");
  const [leaves, setLeaves] = useState<LeaveDto[]>([]);
  const [holidays, setHolidays] = useState<HolidayDto[]>([]);
  const [people, setPeople] = useState<PersonOptionDto[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>(initialWeekendDays);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leaveUserId, setLeaveUserId] = useState("");
  const [leaveFrom, setLeaveFrom] = useState(today);
  const [leaveTo, setLeaveTo] = useState(today);
  const [savingLeave, setSavingLeave] = useState(false);

  const [holidayDate, setHolidayDate] = useState(today);
  const [holidayName, setHolidayName] = useState("");
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editName, setEditName] = useState("");
  const [savingWeekend, setSavingWeekend] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [leaveResult, holidayResult, peopleResult] = await Promise.all([
      fetchJson<{ leaves: LeaveDto[] }>("/api/leaves"),
      fetchJson<{ holidays: HolidayDto[] }>("/api/holidays"),
      fetchJson<{ people: PersonOptionDto[] }>("/api/people"),
    ]);
    setLoading(false);

    if (!leaveResult.ok || !leaveResult.data) {
      setError(leaveResult.error ?? "Could not load leave.");
      return;
    }
    if (!holidayResult.ok || !holidayResult.data) {
      setError(holidayResult.error ?? "Could not load holidays.");
      return;
    }

    setError(null);
    setLeaves(leaveResult.data.leaves);
    setHolidays(holidayResult.data.holidays);
    if (peopleResult.ok && peopleResult.data) {
      setPeople(peopleResult.data.people);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (leaveFrom > leaveTo) {
      setError("The end date must be on or after the start date.");
      return;
    }

    setSavingLeave(true);
    const result = await callApiJson<{ leave: LeaveDto }>(
      "/api/leaves",
      "POST",
      {
        userId: leaveUserId || undefined,
        fromDate: leaveFrom,
        toDate: leaveTo,
      },
    );
    setSavingLeave(false);

    if (!result.ok) {
      setError(result.error ?? "Could not mark leave.");
      return;
    }

    toast.show("Leave marked.", "success");
    setLeaveUserId("");
    setLeaveFrom(today);
    setLeaveTo(today);
    await load();
  }

  async function addHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSavingHoliday(true);

    const result = await callApiJson<{ holiday: HolidayDto }>(
      "/api/holidays",
      "POST",
      { date: holidayDate, name: holidayName },
    );
    setSavingHoliday(false);

    if (!result.ok) {
      setError(result.error ?? "Could not add the holiday.");
      return;
    }

    toast.show("Holiday added.", "success");
    setHolidayName("");
    await load();
  }

  async function saveHoliday(id: string) {
    const result = await callApiJson<{ holiday: HolidayDto }>(
      `/api/holidays/${id}`,
      "PATCH",
      { date: editDate, name: editName },
    );

    if (!result.ok) {
      toast.show(result.error ?? "Could not update the holiday.", "error");
      return;
    }

    toast.show("Holiday updated.", "success");
    setEditingId(null);
    await load();
  }

  async function removeHoliday(id: string) {
    if (!window.confirm("Delete this holiday?")) return;

    const result = await callApi(`/api/holidays/${id}`, "DELETE");
    if (!result.ok) {
      toast.show(result.error ?? "Could not delete the holiday.", "error");
      return;
    }

    toast.show("Holiday deleted.", "success");
    await load();
  }

  function toggleWeekendDay(day: number) {
    setWeekendDays((previous) =>
      previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day].sort((a, b) => a - b),
    );
  }

  async function saveWeekend() {
    setSavingWeekend(true);
    const result = await callApiJson<{ days: number[] }>(
      "/api/settings/weekend",
      "PATCH",
      { days: weekendDays },
    );
    setSavingWeekend(false);

    if (!result.ok) {
      toast.show(result.error ?? "Could not update the weekend.", "error");
      return;
    }

    toast.show("Weekend updated.", "success");
    await load();
  }

  const isOnLeaveToday = (leave: LeaveDto) =>
    datePart(leave.fromDate) <= today && datePart(leave.toDate) >= today;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Leave &amp; Holidays
        </h1>
        <p className="text-sm text-muted-foreground">
          Mark leave, manage the holiday calendar and set the weekend.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("leave")}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "leave"
              ? "bg-primary text-primary-foreground"
              : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          Leave
        </button>
        <button
          type="button"
          onClick={() => setTab("holidays")}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "holidays"
              ? "bg-primary text-primary-foreground"
              : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          Holidays
        </button>
      </nav>

      {tab === "leave" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 sm:pt-5">
              <form className="space-y-3" onSubmit={markLeave}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {canMarkForOthers ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="leave-user"
                        className="text-sm font-medium"
                      >
                        Who is on leave
                      </label>
                      <select
                        id="leave-user"
                        value={leaveUserId}
                        onChange={(event) =>
                          setLeaveUserId(event.target.value)
                        }
                        className={inputClass}
                        disabled={savingLeave}
                      >
                        <option value="">Myself</option>
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name} - {person.department}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <Field
                    id="leave-from"
                    label="From"
                    type="date"
                    value={leaveFrom}
                    onChange={(event) => setLeaveFrom(event.target.value)}
                    disabled={savingLeave}
                    required
                  />
                  <Field
                    id="leave-to"
                    label="To"
                    type="date"
                    value={leaveTo}
                    onChange={(event) => setLeaveTo(event.target.value)}
                    disabled={savingLeave}
                    required
                  />
                </div>

                <Button type="submit" disabled={savingLeave}>
                  {savingLeave ? "Saving..." : "Mark leave"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Leave records</h2>

            {loading && leaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : null}

            {!loading && leaves.length === 0 ? (
              <EmptyState
                icon={Palmtree}
                title="No leave marked"
                description="Mark leave above for a date or a range."
              />
            ) : null}

            {leaves.map((leave) => (
              <div
                key={leave.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{leave.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {leave.position} &middot; {leave.department}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDhakaDate(leave.fromDate)} &ndash;{" "}
                    {formatDhakaDate(leave.toDate)} (
                    {daysBetween(leave.fromDate, leave.toDate)}{" "}
                    {daysBetween(leave.fromDate, leave.toDate) === 1
                      ? "day"
                      : "days"}
                    )
                  </p>
                  {leave.createdBy.id !== leave.userId ? (
                    <p className="text-xs text-muted-foreground">
                      Marked by {leave.createdBy.name}
                    </p>
                  ) : null}
                </div>
                {isOnLeaveToday(leave) ? (
                  <Badge variant="onLeave">On leave</Badge>
                ) : null}
              </div>
            ))}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          {canManageWeekend ? (
            <Card>
              <CardContent className="space-y-3 pt-4 sm:pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Weekend days</p>
                    <p className="text-xs text-muted-foreground">
                      Used by the not-submitted list and the 7 PM reminder.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void saveWeekend()}
                    disabled={savingWeekend || weekendDays.length === 0}
                  >
                    {savingWeekend ? "Saving..." : "Save"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((day) => (
                    <label
                      key={day.value}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={weekendDays.includes(day.value)}
                        onChange={() => toggleWeekendDay(day.value)}
                        disabled={savingWeekend}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {canManageHolidays ? (
            <Card>
              <CardContent className="pt-4 sm:pt-5">
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={addHoliday}
                >
                  <div className="w-44">
                    <Field
                      id="holiday-date"
                      label="Date"
                      type="date"
                      value={holidayDate}
                      onChange={(event) => setHolidayDate(event.target.value)}
                      disabled={savingHoliday}
                      required
                    />
                  </div>
                  <div className="min-w-48 flex-1">
                    <Field
                      id="holiday-name"
                      label="Holiday name"
                      value={holidayName}
                      onChange={(event) => setHolidayName(event.target.value)}
                      disabled={savingHoliday}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={savingHoliday}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    {savingHoliday ? "Adding..." : "Add holiday"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Holiday calendar</h2>

            {loading && holidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : null}

            {!loading && holidays.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No holidays yet"
                description="Holidays are excluded from the not-submitted list."
              />
            ) : null}

            {holidays.map((holiday) => (
              <div
                key={holiday.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                {editingId === holiday.id ? (
                  <div className="flex flex-1 flex-wrap items-end gap-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(event) => setEditDate(event.target.value)}
                      className={inputClass}
                    />
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className={inputClass}
                      maxLength={100}
                    />
                    <Button
                      size="sm"
                      onClick={() => void saveHoliday(holiday.id)}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium">{holiday.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDhakaDate(holiday.date)}
                      </p>
                    </div>
                    {canManageHolidays ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(holiday.id);
                            setEditDate(datePart(holiday.date));
                            setEditName(holiday.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void removeHoliday(holiday.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
