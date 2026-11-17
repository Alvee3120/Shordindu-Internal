"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/auth/field";
import { callApi, type ApiResult } from "@/components/api-client";

const emptyForm = {
  name: "",
  email: "",
  department: "",
  position: "",
  role: "Employee",
};

export function AddUserForm({
  departments,
  canGrantAdmin,
  onCompleted,
}: {
  departments: string[];
  canGrantAdmin: boolean;
  onCompleted: (result: ApiResult) => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const roleOptions = [
    "Employee",
    "Manager",
    "HR",
    ...(canGrantAdmin ? ["Admin"] : []),
  ];

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});

    const result = await callApi("/api/users", "POST", form);
    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
    } else {
      setForm(emptyForm);
    }
    onCompleted(result);
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      onSubmit={submit}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="new-name"
          label="Full name"
          required
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
          error={fieldErrors.name}
          disabled={pending}
        />
        <Field
          id="new-email"
          label="Work email"
          type="email"
          required
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          error={fieldErrors.email}
          disabled={pending}
        />
        <SelectField
          id="new-department"
          label="Department"
          options={departments}
          placeholder="Select department"
          required
          value={form.department}
          onChange={(event) => update("department", event.target.value)}
          error={fieldErrors.department}
          disabled={pending}
        />
        <Field
          id="new-position"
          label="Position"
          placeholder="e.g. Supply Chain Executive"
          required
          value={form.position}
          onChange={(event) => update("position", event.target.value)}
          error={fieldErrors.position}
          disabled={pending}
        />
        <SelectField
          id="new-role"
          label="Role"
          options={roleOptions}
          required
          value={form.role}
          onChange={(event) => update("role", event.target.value)}
          error={fieldErrors.role}
          disabled={pending}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        The user becomes Active immediately and receives an invite to set their
        password through the forgot-password flow.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add user and send invite"}
      </Button>
    </form>
  );
}
