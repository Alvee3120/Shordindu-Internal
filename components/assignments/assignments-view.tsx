"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { AssignmentCard } from "@/components/assignments/assignment-card";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { fetchJson } from "@/components/api-client";
import type {
  AssignmentDto,
  PersonOptionDto,
} from "@/components/assignments/types";

type View = "to_me" | "by_me" | "all";

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const VIEW_LABELS: Record<View, string> = {
  to_me: "Assigned to me",
  by_me: "Assigned by me",
  all: "All assignments",
};

export function AssignmentsView({ departments }: { departments: string[] }) {
  const toast = useToast();
  const [view, setView] = useState<View>("to_me");
  const [personId, setPersonId] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [people, setPeople] = useState<PersonOptionDto[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await fetchJson<{ people: PersonOptionDto[] }>(
        "/api/people"
      );
      if (result.ok && result.data) setPeople(result.data.people);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ view });
    if (personId) params.set("personId", personId);
    if (department) params.set("department", department);
    if (status) params.set("status", status);
    if (dueFrom) params.set("dueFrom", dueFrom);
    if (dueTo) params.set("dueTo", dueTo);

    const result = await fetchJson<{ assignments: AssignmentDto[] }>(
      `/api/assignments?${params.toString()}`
    );
    setLoading(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load assignments.");
      return;
    }

    setError(null);
    setAssignments(result.data.assignments);
  }, [view, personId, department, status, dueFrom, dueTo]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Assignments</h1>
          <p className="text-sm text-muted-foreground">
            Assign instructions, track per-person status and due dates.
          </p>
        </div>
        <Button
          onClick={() => setCreating((value) => !value)}
          variant={creating ? "outline" : "default"}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {creating ? "Close" : "New assignment"}
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

      {creating ? (
        <AssignmentForm
          people={people}
          departments={departments}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      <nav className="flex flex-wrap gap-2">
        {(Object.keys(VIEW_LABELS) as View[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              view === item
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {VIEW_LABELS[item]}
          </button>
        ))}
      </nav>

      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 sm:pt-5 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label
              htmlFor="assignment-filter-person"
              className="text-sm font-medium"
            >
              Person
            </label>
            <select
              id="assignment-filter-person"
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              className={inputClass}
            >
              <option value="">Everyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="assignment-filter-department"
              className="text-sm font-medium"
            >
              Department
            </label>
            <select
              id="assignment-filter-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className={inputClass}
            >
              <option value="">All departments</option>
              {departments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="assignment-filter-status"
              className="text-sm font-medium"
            >
              Status
            </label>
            <select
              id="assignment-filter-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={inputClass}
            >
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="assignment-filter-from"
              className="text-sm font-medium"
            >
              Due from
            </label>
            <input
              id="assignment-filter-from"
              type="date"
              value={dueFrom}
              onChange={(event) => setDueFrom(event.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="assignment-filter-to"
              className="text-sm font-medium"
            >
              Due to
            </label>
            <input
              id="assignment-filter-to"
              type="date"
              value={dueTo}
              onChange={(event) => setDueTo(event.target.value)}
              className={inputClass}
            />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        {loading
          ? Array.from({ length: 2 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          : null}

        {!loading && assignments.length === 0 && !error ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignments here"
            description={
              view === "to_me"
                ? "Assignments sent to you will appear here."
                : view === "by_me"
                  ? "Create an assignment to get started."
                  : "Try different filters or create an assignment."
            }
            action={
              <Button
                size="sm"
                onClick={() => {
                  setCreating(true);
                  toast.show("Fill in the assignment above.", "info");
                }}
              >
                New assignment
              </Button>
            }
          />
        ) : null}

        {assignments.map((assignment) => (
          <AssignmentCard
            key={assignment.id}
            assignment={assignment}
            people={people}
            departments={departments}
            onChanged={() => void load()}
          />
        ))}
      </section>
    </div>
  );
}
