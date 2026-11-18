"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/auth/field";
import { callApi, type ApiResult } from "@/components/api-client";
import type { PendingUserDto } from "@/components/users/types";

export function PendingUserRow({
  user,
  departments,
  canGrantAdmin,
  onCompleted,
}: {
  user: PendingUserDto;
  departments: string[];
  canGrantAdmin: boolean;
  onCompleted: (result: ApiResult) => void;
}) {
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState(user.department);
  const [position, setPosition] = useState(user.position);
  const [pending, setPending] = useState(false);

  const roleOptions = [
    "Employee",
    "Manager",
    "HR",
    ...(canGrantAdmin ? ["Admin"] : []),
  ];

  async function approve() {
    setPending(true);
    const result = await callApi(`/api/users/${user.id}/approve`, "POST", {
      role,
      department,
      position,
    });
    setPending(false);
    onCompleted(result);
  }

  async function reject() {
    setPending(true);
    const result = await callApi(`/api/users/${user.id}/reject`, "POST");
    setPending(false);
    onCompleted(result);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div>
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <p className="text-xs text-muted-foreground">
          {user.position} &middot; {user.department} &middot; applied{" "}
          {new Date(user.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          id={`role-${user.id}`}
          label="Role"
          options={roleOptions}
          placeholder="Choose role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          disabled={pending}
        />
        <SelectField
          id={`department-${user.id}`}
          label="Department"
          options={departments}
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          disabled={pending}
        />
        <Field
          id={`position-${user.id}`}
          label="Position"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
          disabled={pending}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void approve()} disabled={pending || !role}>
          {pending ? "Working..." : "Approve"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void reject()}
          disabled={pending}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
