"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Palmtree, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/auth/field";
import { useToast } from "@/components/ui/toast";
import { callApi, callApiJson, fetchJson } from "@/components/api-client";
import { formatDhakaDate } from "@/lib/time";
import type { PersonOptionDto } from "@/components/assignments/types";

type LeaveStatus = "Pending" | "Approved" | "Rejected";

interface LeaveDto {
  id: string;
  userId: string;
  name: string;
  department: string;
  position: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: LeaveStatus;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  canDecide: boolean;
}

interface HolidayDto {
  id: string;
  date: string;
  name: string;
  createdAt: string;
}

type Tab = "leave" | "requests" | "holidays";

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
  canApprove,
  canManageHolidays,
  canManageWeekend,
}: {
  today: string;
  initialWeekendDays: number[];
  canMarkForOthers: boolean;
  canApprove: boolean;
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
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [leaveUserId, setLeaveUserId] = useState("");
  const [leaveFrom, setLeaveFrom] = useState(today);
  const [leaveTo, setLeaveTo] = useState(today);
  const [leaveReason, setLeaveReason] = useState("");
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

  async function applyLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (leaveFrom > leaveTo) {
      setError("The end date must be on or after the start date.");
      return;
    }
    if (leaveReason.trim().length < 3) {
      setError("Explain the reason for the leave.");
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
        reason: leaveReason.trim(),
      }
    );
    setSavingLeave(false);

    if (!result.ok) {
      setError(result.error ?? "Could not send the request.");
      return;
    }

    toast.show(result.message ?? "Leave request sent.", "success");
    setLeaveUserId("");
    setLeaveFrom(today);
    setLeaveTo(today);
    setLeaveReason("");
    await load();
  }

  async function decide(id: string, decision: "approve" | "reject") {
    setDecidingId(id);
    const result = await callApiJson<{ leave: LeaveDto }>(
      `/api/leaves/${id}/decision`,
      "POST",
      { decision }
    );
    setDecidingId(null);

    if (!result.ok) {
      toast.show(result.error ?? "Could not save the decision.", "error");
      return;
    }

    toast.show(
      decision === "approve" ? "Leave approved." : "Leave rejected.",
      "success"
    );
    await load();
  }

  async function addHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSavingHoliday(true);

    const result = await callApiJson<{ holiday: HolidayDto }>(
      "/api/holidays",
      "POST",
      { date: holidayDate, name: holidayName }
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
      { date: editDate, name: editName }
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
        : [...previous, day].sort((a, b) => a - b)
    );
  }

  async function saveWeekend() {
    setSavingWeekend(true);
    const result = await callApiJson<{ days: number[] }>(
      "/api/settings/weekend",
      "PATCH",
      { days: weekendDays }
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
    leave.status === "Approved" &&
    datePart(leave.fromDate) <= today &&
    datePart(leave.toDate) >= today;

  const pendingLeaves = leaves.filter((leave) => leave.status === "Pending");
  const decidedLeaves = leaves.filter((leave) => leave.status !== "Pending");

  const tabs: { value: Tab; label: string }[] = [
    { value: "leave", label: "Leave" },
    ...(canApprove
      ? [{ value: "requests" as Tab, label: `Requests (${pendingLeaves.length})` }]
      : []),
    { value: "holidays", label: "Holidays" },
  ];

  function renderLeaveCard(leave: LeaveDto) {
    const days = daysBetween(leave.fromDate, leave.toDate);

    return (
      <div
        key={leave.id}
        className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{leave.name}</p>
              {leave.status === "Approved" ? (
                <Badge variant="active">Approved</Badge>
              ) : leave.status === "Rejected" ? (
                <Badge variant="rejected">Rejected</Badge>
              ) : (
                <Badge variant="pending">Pending</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {leave.position} &middot; {leave.department}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDhakaDate(leave.fromDate)} &ndash;{" "}
              {formatDhakaDate(leave.toDate)} ({days} {days === 1 ? "day" : "days"})
            </p>
          </div>

          {isOnLeaveToday(leave) ? (
            <Badge variant="onLeave">On leave</Badge>
          ) : null}
        </div>

        <p className="whitespace-pre-wrap break-words rounded-md bg-muted/60 px-2.5 py-2 text-xs text-foreground">
          {leave.reason}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {leave.status === "Pending" ? (
              <>Requested by {leave.createdBy.name}</>
            ) : leave.decidedBy ? (
              <>
                {leave.status === "Approved" ? "Approved" : "Rejected"} by{" "}
                <span className="font-medium text-foreground">
                  {leave.decidedBy.name}
                </span>
              </>
            ) : null}
          </p>

          {leave.canDecide ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void decide(leave.id, "approve")}
                disabled={decidingId === leave.id}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void decide(leave.id, "reject")}
                disabled={decidingId === leave.id}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Leave &amp; Holidays
        </h1>
        <p className="text-sm text-muted-foreground">
          Apply for leave, review requests, and manage the holiday calendar.
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
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === item.value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "leave" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 sm:pt-5">
              <form className="space-y-3" onSubmit={applyLeave}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {canMarkForOthers ? (
                    <div className="space-y-1.5">
                      <label htmlFor="leave-user" className="text-sm font-medium">
                        Who is on leave
                      </label>
                      <select
                        id="leave-user"
                        value={leaveUserId}
                        onChange={(event) => setLeaveUserId(event.target.value)}
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

                <div className="space-y-1.5">
                  <label htmlFor="leave-reason" className="text-sm font-medium">
                    Reason
                  </label>
                  <textarea
                    id="leave-reason"
                    value={leaveReason}
                    onChange={(event) => setLeaveReason(event.target.value)}
                    placeholder="Explain why you need this leave"
                    rows={3}
                    maxLength={1000}
                    disabled={savingLeave}
                    required
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <Button type="submit" disabled={savingLeave}>
                  {savingLeave
                    ? "Sending..."
                    : canMarkForOthers && leaveUserId
                      ? "Mark leave (approved)"
                      : "Request leave"}
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
                title="No leave yet"
                description="Request leave above for a date or a range."
              />
            ) : null}

            {decidedLeaves.map(renderLeaveCard)}
          </section>
        </div>
      ) : tab === "requests" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pending requests</h2>

          {!loading && pendingLeaves.length === 0 ? (
            <EmptyState
              icon={Palmtree}
              title="Nothing waiting"
              description="New leave requests will appear here for review."
            />
          ) : null}

          {pendingLeaves.map(renderLeaveCard)}
        </section>
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
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
