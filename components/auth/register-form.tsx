"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, SelectField } from "@/components/auth/field";

type Step = "details" | "code" | "done";

interface Details {
  name: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

const emptyDetails: Details = {
  name: "",
  department: "",
  position: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

function toPayload(details: Details) {
  return {
    name: details.name,
    department: details.department,
    position: details.position,
    email: details.email,
    phone: details.phone,
    password: details.password,
  };
}

export function RegisterForm({ departments }: { departments: string[] }) {
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  function updateField(field: keyof Details, value: string) {
    setDetails((previous) => ({ ...previous, [field]: value }));
  }

  async function submitDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (details.password !== details.confirmPassword) {
      setError("Passwords do not match.");
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(details)),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setFieldErrors(data.fieldErrors ?? {});
        return;
      }

      setNotice(data.message ?? "Check your email for the code.");
      setCode("");
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: details.email, code }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStep("done");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resendCode() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(details)),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setNotice(data.message ?? "Check your email for a new code.");
      setCode("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (step === "done") {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Waiting for approval</h2>
          <p className="text-sm text-muted-foreground">
            Your email is verified. An admin will review your account, then you
            can sign in.
          </p>
        </div>
        <Link
          href="/login"
          className={buttonVariants({ className: "w-full" })}
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form className="space-y-4" onSubmit={verifyCode}>
        {notice ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Enter the code sent to{" "}
          <span className="font-medium text-foreground">{details.email}</span>
        </p>

        <Field
          id="code"
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          disabled={pending}
        />

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={pending || code.length !== 6}
        >
          {pending ? "Verifying..." : "Verify email"}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-60"
            onClick={() => setStep("details")}
            disabled={pending}
          >
            Change details
          </button>
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-60"
            onClick={() => void resendCode()}
            disabled={pending}
          >
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submitDetails}>
      <Field
        id="name"
        label="Full name"
        autoComplete="name"
        required
        value={details.name}
        onChange={(event) => updateField("name", event.target.value)}
        error={fieldErrors.name}
        disabled={pending}
      />

      <SelectField
        id="department"
        label="Department"
        options={departments}
        placeholder="Select your department"
        required
        value={details.department}
        onChange={(event) => updateField("department", event.target.value)}
        error={fieldErrors.department}
        disabled={pending}
      />

      <Field
        id="position"
        label="Position"
        placeholder="e.g. Supply Chain Executive"
        required
        value={details.position}
        onChange={(event) => updateField("position", event.target.value)}
        error={fieldErrors.position}
        disabled={pending}
      />

      <Field
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        value={details.email}
        onChange={(event) => updateField("email", event.target.value)}
        error={fieldErrors.email}
        disabled={pending}
      />

      <Field
        id="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        required
        value={details.phone}
        onChange={(event) => updateField("phone", event.target.value)}
        error={fieldErrors.phone}
        disabled={pending}
      />

      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={details.password}
        onChange={(event) => updateField("password", event.target.value)}
        error={fieldErrors.password}
        disabled={pending}
      />

      <Field
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={details.confirmPassword}
        onChange={(event) => updateField("confirmPassword", event.target.value)}
        error={fieldErrors.confirmPassword}
        disabled={pending}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending code..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
