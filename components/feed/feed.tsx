"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Newspaper, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { UpdateCard } from "@/components/updates/update-card";
import { fetchJson } from "@/components/api-client";
import type { FeedItemDto, PersonDto } from "@/components/feed/types";

type DateMode = "today" | "single" | "range";

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FilterField({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Feed({
  today,
  departments,
}: {
  today: string;
  departments: string[];
}) {
  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [singleDate, setSingleDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [personId, setPersonId] = useState("");
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [items, setItems] = useState<FeedItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void (async () => {
      const result = await fetchJson<{ people: PersonDto[] }>("/api/people");
      if (result.ok && result.data) setPeople(result.data.people);
    })();
  }, []);

  const queryFor = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();

      if (dateMode === "today") {
        params.set("from", today);
        params.set("to", today);
      } else if (dateMode === "single") {
        params.set("from", singleDate);
        params.set("to", singleDate);
      } else {
        params.set("from", from);
        params.set("to", to);
      }

      if (personId) params.set("userId", personId);
      if (department) params.set("department", department);
      if (appliedSearch) params.set("q", appliedSearch);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "10");

      return params.toString();
    },
    [
      dateMode,
      today,
      singleDate,
      from,
      to,
      personId,
      department,
      appliedSearch,
    ],
  );

  const load = useCallback(
    async (cursor: string | null) => {
      const replace = cursor === null;
      if (replace) {
        const incomplete =
          (dateMode === "single" && !singleDate) ||
          (dateMode === "range" && (!from || !to));
        if (incomplete) {
          setItems([]);
          setNextCursor(null);
          setLoading(false);
          return;
        }
        setLoading(true);
        setNextCursor(null);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      loadingRef.current = true;

      const result = await fetchJson<{
        items: FeedItemDto[];
        nextCursor: string | null;
      }>(`/api/feed?${queryFor(cursor)}`);

      loadingRef.current = false;
      if (replace) setLoading(false);
      else setLoadingMore(false);

      if (!result.ok || !result.data) {
        setError(result.error ?? "Could not load the feed.");
        return;
      }

      const page = result.data;
      setItems((previous) =>
        replace ? page.items : [...previous, ...page.items],
      );
      setNextCursor(page.nextCursor);
    },
    [queryFor, dateMode, singleDate, from, to],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !nextCursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current) {
          void load(nextCursor);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, load]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="text-sm text-muted-foreground">
          Everyone&apos;s daily updates, newest first.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 sm:pt-5 lg:grid-cols-4">
          <FilterField htmlFor="feed-date-mode" label="Date">
            <select
              id="feed-date-mode"
              value={dateMode}
              onChange={(event) =>
                setDateMode(event.target.value as DateMode)
              }
              className={inputClass}
            >
              <option value="today">Today</option>
              <option value="single">Pick a date</option>
              <option value="range">Date range</option>
            </select>
          </FilterField>

          {dateMode === "single" ? (
            <FilterField htmlFor="feed-date" label="On">
              <input
                id="feed-date"
                type="date"
                value={singleDate}
                max={today}
                onChange={(event) => setSingleDate(event.target.value)}
                className={inputClass}
              />
            </FilterField>
          ) : null}

          {dateMode === "range" ? (
            <>
              <FilterField htmlFor="feed-from" label="From">
                <input
                  id="feed-from"
                  type="date"
                  value={from}
                  max={to || today}
                  onChange={(event) => setFrom(event.target.value)}
                  className={inputClass}
                />
              </FilterField>
              <FilterField htmlFor="feed-to" label="To">
                <input
                  id="feed-to"
                  type="date"
                  value={to}
                  max={today}
                  onChange={(event) => setTo(event.target.value)}
                  className={inputClass}
                />
              </FilterField>
            </>
          ) : null}

          <FilterField htmlFor="feed-person" label="Person">
            <select
              id="feed-person"
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              className={inputClass}
            >
              <option value="">Everyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} - {person.department}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField htmlFor="feed-department" label="Department">
            <select
              id="feed-department"
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
          </FilterField>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <label htmlFor="feed-search" className="text-sm font-medium">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="feed-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search a person's name or a keyword"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          : null}

        {!loading && items.length === 0 && !error ? (
          <EmptyState
            icon={Newspaper}
            title="No updates found"
            description="Try another date, person, department or search term."
          />
        ) : null}

        {items.map((item) => (
          <UpdateCard
            key={item.id}
            author={item.author}
            update={{
              id: item.id,
              updateDate: item.updateDate,
              postedAt: item.postedAt,
              isLate: item.isLate,
              editedAt: item.editedAt,
              contentHtml: item.contentHtml,
              canEdit: false,
            }}
            highlightHtml={item.headline}
            showLockBadge={false}
          />
        ))}

        <div ref={sentinelRef} aria-hidden className="h-1" />

        {loadingMore ? (
          <p className="text-center text-sm text-muted-foreground">
            Loading more...
          </p>
        ) : null}

        {!loading && !loadingMore && items.length > 0 && !nextCursor ? (
          <p className="text-center text-xs text-muted-foreground">
            You are all caught up.
          </p>
        ) : null}
      </section>
    </div>
  );
}
