"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fetchList, type ApiResult } from "@/components/api-client";
import { AddUserForm } from "@/components/users/add-user-form";
import { ManagedUserRow } from "@/components/users/managed-user-row";
import { PendingUserRow } from "@/components/users/pending-user-row";
import type {
  ManagedRole,
  ManagedUserDto,
  PendingUserDto,
} from "@/components/users/types";

type Tab = "pending" | "users" | "add";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export function UserManagement({
  actorRole,
  actorId,
  departments,
}: {
  actorRole: ManagedRole;
  actorId: string;
  departments: string[];
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const [pendingUsers, setPendingUsers] = useState<PendingUserDto[]>([]);
  const [users, setUsers] = useState<ManagedUserDto[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canGrantAdmin = actorRole === "Admin";

  const loadAll = useCallback(async (searchTerm: string) => {
    setLoading(true);
    const [pendingResult, usersResult] = await Promise.all([
      fetchList<PendingUserDto>("/api/users/pending"),
      fetchList<ManagedUserDto>(
        `/api/users?search=${encodeURIComponent(searchTerm)}`
      ),
    ]);
    setLoading(false);

    if (!pendingResult.ok || !usersResult.ok) {
      setError(
        pendingResult.error ?? usersResult.error ?? "Could not load users."
      );
      return;
    }

    setPendingUsers(pendingResult.items);
    setUsers(usersResult.items);
  }, []);

  useEffect(() => {
    void loadAll("");
  }, [loadAll]);

  function handleCompleted(result: ApiResult) {
    if (result.ok) {
      toast.show(result.message ?? "Saved.", "success");
      setError(null);
      void loadAll(appliedSearch);
    } else {
      setError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search);
    setError(null);
    void loadAll(search);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Approve signups, add people and manage roles.
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
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
          Pending requests ({pendingUsers.length})
        </TabButton>
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>
          All users ({users.length})
        </TabButton>
        <TabButton active={tab === "add"} onClick={() => setTab("add")}>
          Add user
        </TabButton>
      </nav>

      {tab === "pending" ? (
        <section className="space-y-3">
          {loading && pendingUsers.length === 0
            ? Array.from({ length: 2 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))
            : null}
          {!loading && pendingUsers.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No pending requests"
              description="New signups appear here after they verify their email."
            />
          ) : null}
          {pendingUsers.map((user) => (
            <PendingUserRow
              key={user.id}
              user={user}
              departments={departments}
              canGrantAdmin={canGrantAdmin}
              onCompleted={handleCompleted}
            />
          ))}
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="space-y-3">
          <form className="flex gap-2" onSubmit={onSearch}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, department or position"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          {loading && users.length === 0
            ? Array.from({ length: 3 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))
            : null}
          {!loading && users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description="Try a different search, or add a user directly."
            />
          ) : null}
          {users.map((user) => (
            <ManagedUserRow
              key={`${user.id}:${user.role}:${user.department}:${user.status}`}
              user={user}
              departments={departments}
              canGrantAdmin={canGrantAdmin}
              canManageAdmin={canGrantAdmin}
              canDelete={canGrantAdmin}
              isSelf={user.id === actorId}
              onCompleted={handleCompleted}
            />
          ))}
        </section>
      ) : null}

      {tab === "add" ? (
        <section>
          <AddUserForm
            departments={departments}
            canGrantAdmin={canGrantAdmin}
            onCompleted={handleCompleted}
          />
        </section>
      ) : null}
    </div>
  );
}
