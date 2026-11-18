"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { PersonOptionDto } from "@/components/assignments/types";

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Two-step assignee picker for a long staff list. Department narrows the People
 * dropdown; picking a person without a department selects their department for
 * them. Selections accumulate across departments, so a task can span teams.
 */
export function AssigneePicker({
  people,
  departments,
  selectedIds,
  onChange,
  disabled = false,
}: {
  people: PersonOptionDto[];
  departments: string[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [department, setDepartment] = useState("");

  const byId = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people]
  );

  const visiblePeople = useMemo(
    () =>
      (department
        ? people.filter((person) => person.department === department)
        : people
      ).slice(),
    [people, department]
  );

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => byId.get(id))
        .filter((person): person is PersonOptionDto => Boolean(person)),
    [selectedIds, byId]
  );

  function addPerson(personId: string) {
    if (!personId) return;
    const person = byId.get(personId);
    if (!person) return;

    if (!selectedIds.includes(personId)) {
      onChange([...selectedIds, personId]);
    }

    // Choosing someone without a department fills it in, so the list stays
    // scoped to where that person works.
    if (!department) setDepartment(person.department);
  }

  function removePerson(personId: string) {
    onChange(selectedIds.filter((id) => id !== personId));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="assignee-department" className="text-sm font-medium">
            Department
          </label>
          <select
            id="assignee-department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className={inputClass}
            disabled={disabled}
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
          <label htmlFor="assignee-person" className="text-sm font-medium">
            People
          </label>
          <select
            id="assignee-person"
            value=""
            onChange={(event) => addPerson(event.target.value)}
            className={inputClass}
            disabled={disabled || visiblePeople.length === 0}
          >
            <option value="">
              {visiblePeople.length === 0
                ? "No active people here"
                : "Choose a person to add"}
            </option>
            {visiblePeople
              .filter((person) => !selectedIds.includes(person.id))
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {department ? "" : ` — ${person.department}`}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Selected
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {selected.length === 0
              ? "nobody yet"
              : `${selected.length} ${selected.length === 1 ? "person" : "people"}`}
          </span>
        </p>

        {selected.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Add at least one person to assign this to.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((person) => (
              <li key={person.id}>
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary py-1 pl-1 pr-1.5 text-xs">
                  <Avatar
                    name={person.name}
                    size="sm"
                    className="h-5 w-5 text-[9px]"
                  />
                  <span className="min-w-0 truncate font-medium">
                    {person.name}
                  </span>
                  <span className="hidden shrink-0 text-muted-foreground sm:inline">
                    {person.department}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePerson(person.id)}
                    disabled={disabled}
                    aria-label={`Remove ${person.name}`}
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
