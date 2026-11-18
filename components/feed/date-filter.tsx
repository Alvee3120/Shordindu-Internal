"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatDhakaDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface DateFilterValue {
  from: string;
  to: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
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

/** Builds YYYY-MM-DD without ever touching the browser timezone. */
function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Sunday-first column offset for the first of the month. */
function leadingBlanks(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/** Keeps the range compact, e.g. "10 – 15 Nov 2026" inside one month. */
function rangeLabel(from: string, to: string, today: string): string {
  if (from === to) return from === today ? "Today" : formatDhakaDate(from);

  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromMonth = MONTHS[(fm ?? 1) - 1]?.slice(0, 3);
  const toMonth = MONTHS[(tm ?? 1) - 1]?.slice(0, 3);

  if (fy === ty && fm === tm) return `${fd} – ${td} ${toMonth} ${ty}`;
  if (fy === ty) return `${fd} ${fromMonth} – ${td} ${toMonth} ${ty}`;
  return `${formatDhakaDate(from)} – ${formatDhakaDate(to)}`;
}

export function DateFilter({
  value,
  today,
  onChange,
}: {
  value: DateFilterValue;
  today: string;
  onChange: (next: DateFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pickedStart, setPickedStart] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [viewYear, viewMonth] = useMemo(() => {
    const [year, month] = value.from.split("-").map(Number);
    return [year ?? 2026, month ?? 1];
  }, [value.from]);

  const [shown, setShown] = useState({ year: viewYear, month: viewMonth });

  useEffect(() => {
    setShown({ year: viewYear, month: viewMonth });
  }, [viewYear, viewMonth]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPickedStart(null);
        setHovered(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setPickedStart(null);
        setHovered(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = rangeLabel(value.from, value.to, today);

  /**
   * A click selects one day. A second click on another day extends it to a
   * range, so one control covers both cases without a mode switch.
   */
  function pick(day: string) {
    if (!pickedStart) {
      setPickedStart(day);
      onChange({ from: day, to: day });
      return;
    }

    if (day === pickedStart) {
      setPickedStart(null);
      onChange({ from: day, to: day });
      return;
    }

    const [from, to] =
      day < pickedStart ? [day, pickedStart] : [pickedStart, day];
    setPickedStart(null);
    onChange({ from, to });
  }

  function shiftMonth(delta: number) {
    setShown((current) => {
      const next = new Date(
        Date.UTC(current.year, current.month - 1 + delta, 1)
      );
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
    });
  }

  const blanks = leadingBlanks(shown.year, shown.month);
  const total = daysInMonth(shown.year, shown.month);

  const previewEnd = pickedStart && hovered ? hovered : null;
  const rangeStart =
    pickedStart && previewEnd
      ? previewEnd < pickedStart
        ? previewEnd
        : pickedStart
      : value.from;
  const rangeEnd =
    pickedStart && previewEnd
      ? previewEnd < pickedStart
        ? pickedStart
        : previewEnd
      : value.to;

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <span className="text-sm font-medium">Date</span>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Date filter: ${label}`}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
          open && "ring-2 ring-ring"
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date or date range"
          className="absolute left-0 top-full z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-lg"
        >
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold">
              {MONTHS[shown.month - 1]} {shown.year}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 pb-1">
            {WEEKDAYS.map((day, index) => (
              <span
                key={`${day}-${index}`}
                aria-hidden
                className="flex h-7 items-center justify-center text-[11px] font-medium text-muted-foreground"
              >
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: blanks }).map((_, index) => (
              <span key={`blank-${index}`} aria-hidden />
            ))}

            {Array.from({ length: total }).map((_, index) => {
              const dayNumber = index + 1;
              const key = toKey(shown.year, shown.month, dayNumber);
              const disabled = key > today;
              const isStart = key === rangeStart;
              const isEnd = key === rangeEnd;
              const inRange = key > rangeStart && key < rangeEnd;
              const isToday = key === today;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(key)}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered(null)}
                  aria-label={key}
                  aria-pressed={isStart || isEnd}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-sm transition",
                    disabled && "cursor-not-allowed text-muted-foreground/40",
                    !disabled &&
                      !isStart &&
                      !isEnd &&
                      !inRange &&
                      "text-foreground hover:bg-secondary",
                    inRange && "bg-primary/15 font-medium text-primary",
                    (isStart || isEnd) &&
                      "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                    isToday &&
                      !isStart &&
                      !isEnd &&
                      "ring-1 ring-inset ring-primary/40"
                  )}
                >
                  {dayNumber}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <p className="truncate text-xs text-muted-foreground">
              {pickedStart ? "Pick the last day" : label}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setPickedStart(null);
                  onChange({ from: today, to: today });
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setPickedStart(null);
                  setHovered(null);
                }}
                aria-label="Close date picker"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
