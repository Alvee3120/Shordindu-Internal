"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/auth/field";
import { callApi, type ApiResult } from "@/components/api-client";
import type { ManagedUserDto } from "@/components/users/types";

const statusVariants = {
  Active: "active",
  Pending: "pending",
  Rejected: "rejected",
  Disabled: "disabled",
} as const;

export function ManagedUserRow({
  user,
  departments,
  canGrantAdmin,
  canManageAdmin,
  isSelf,
  onCompleted,
}: {
  user: ManagedUserDto;
  departments: string[];
  canGrantAdmin: boolean;
  canManageAdmin: boolean;
  isSelf: boolean;
  onCompleted: (result: ApiResult) => void;
}) {
  const [role, setRole] = useState(user.role ?? "");
  const [department, setDepartment] = useState(user.department);
  const [pending, setPending] = useState(false);

  const roleOptions = [
    "Employee",
    "Manager",
    "HR",
    ...(canGrantAdmin ? ["Admin"] : []),
  ];
  const locked = isSelf || (!canManageAdmin && user.role === "Admin");
  const canToggleStatus =
    !locked && (user.status === "Active" || user.status === "Disabled");
  const changed = role !== (user.role ?? "") || department !== user.department;

  async function save() {
    if (!changed) return;
    if (!role) {
      onCompleted({ ok: false, error: "Choose a role for this user." });
      return;
    }

    setPending(true);
    const body: { role?: string; department?: string } = {};
    if (role !== (user.role ?? "")) body.role = role;
    if (department !== user.department) body.department = department;

    const result = await callApi(`/api/users/${user.id}`, "PATCH", body);
    setPending(false);
    onCompleted(result);
  }

  async function toggleStatus() {
    setPending(true);
    const result = await callApi(`/api/users/${user.id}`, "PATCH", {
      status: user.status === "Active" ? "Disabled" : "Active",
    });
    setPending(false);
    onCompleted(result);
  }

  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-1">
        <p className="font-medium">
          {user.name}
          {isSelf ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (you)
            </span>
          ) : null}
        </p>
        <p className="break-all text-sm text-muted-foreground">{user.email}</p>
        <p className="text-xs text-muted-foreground">{user.position}</p>
        <Badge variant={statusVariants[user.status] ?? "neutral"}>
          {user.status}
        </Badge>
        {user.onLeaveToday ? (
          <Badge variant="onLeave" className="ml-1">
            On leave
          </Badge>
        ) : null}
      </div>

      <SelectField
        id={`role-${user.id}`}
        label="Role"
        options={roleOptions}
        placeholder="No role"
        value={role}
        onChange={(event) => setRole(event.target.value)}
        disabled={locked || pending}
      />

      <SelectField
        id={`department-${user.id}`}
        label="Department"
        options={departments}
        value={department}
        onChange={(event) => setDepartment(event.target.value)}
        disabled={locked || pending}
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={pending || locked || !changed}
        >
          Save
        </Button>
        {canToggleStatus ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void toggleStatus()}
            disabled={pending}
          >
            {user.status === "Active" ? "Disable" : "Enable"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
