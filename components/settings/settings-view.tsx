"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/auth/field";
import { useToast } from "@/components/ui/toast";
import { callApiJson } from "@/components/api-client";

const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

export function SettingsView({
  initialDepartments,
  initialWeekendDays,
  initialReminderTime,
}: {
  initialDepartments: string[];
  initialWeekendDays: number[];
  initialReminderTime: string;
}) {
  const toast = useToast();
  const [departments, setDepartments] = useState<string[]>(initialDepartments);
  const [weekendDays, setWeekendDays] = useState<number[]>(initialWeekendDays);
  const [reminderTime, setReminderTime] = useState(initialReminderTime);
  const [savingDepartments, setSavingDepartments] = useState(false);
  const [savingWeekend, setSavingWeekend] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);

  function updateDepartment(index: number, value: string) {
    setDepartments((previous) =>
      previous.map((name, position) => (position === index ? value : name)),
    );
  }

  function removeDepartment(index: number) {
    setDepartments((previous) =>
      previous.filter((_, position) => position !== index),
    );
  }

  async function saveDepartments() {
    const cleaned = departments.map((name) => name.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast.show("Keep at least one department.", "error");
      return;
    }
    if (
      new Set(cleaned.map((name) => name.toLowerCase())).size !== cleaned.length
    ) {
      toast.show("Department names must be unique.", "error");
      return;
    }

    setSavingDepartments(true);
    const result = await callApiJson<{ departments: string[] }>(
      "/api/settings/departments",
      "PATCH",
      { departments: cleaned },
    );
    setSavingDepartments(false);

    if (!result.ok) {
      toast.show(result.error ?? "Could not save departments.", "error");
      return;
    }

    if (result.data) setDepartments(result.data.departments);
    toast.show("Departments updated.", "success");
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
      toast.show(result.error ?? "Could not save the weekend.", "error");
      return;
    }

    toast.show("Weekend updated.", "success");
  }

  async function saveReminder() {
    setSavingReminder(true);
    const result = await callApiJson<{ time: string }>(
      "/api/settings/reminder",
      "PATCH",
      { time: reminderTime },
    );
    setSavingReminder(false);

    if (!result.ok) {
      toast.show(result.error ?? "Could not save the reminder time.", "error");
      return;
    }

    toast.show(result.message ?? "Reminder time updated.", "success");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Departments, weekend days and the daily reminder time.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Departments</p>
              <p className="text-xs text-muted-foreground">
                Used by registration, user management and assignment filters.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDepartments((previous) => [...previous, ""])}
                disabled={savingDepartments}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
              <Button
                size="sm"
                onClick={() => void saveDepartments()}
                disabled={savingDepartments}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {savingDepartments ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {departments.map((department, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={department}
                  onChange={(event) =>
                    updateDepartment(index, event.target.value)
                  }
                  maxLength={100}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={savingDepartments}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeDepartment(index)}
                  disabled={savingDepartments || departments.length <= 1}
                  aria-label="Remove department"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Weekend days</p>
              <p className="text-xs text-muted-foreground">
                Skipped by the not-submitted list and the daily reminder.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => void saveWeekend()}
              disabled={savingWeekend || weekendDays.length === 0}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
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

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4 sm:pt-5">
          <div className="w-44">
            <Field
              id="reminder-time"
              label="Daily reminder time (Dhaka)"
              type="time"
              value={reminderTime}
              onChange={(event) => setReminderTime(event.target.value)}
              disabled={savingReminder}
            />
          </div>
          <Button
            onClick={() => void saveReminder()}
            disabled={savingReminder || !reminderTime}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {savingReminder ? "Saving..." : "Save"}
          </Button>
          <p className="pb-2 text-xs text-muted-foreground">
            The scheduled job updates immediately.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
