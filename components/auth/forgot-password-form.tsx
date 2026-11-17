"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/auth/field";

type Step = "email" | "code" | "done";

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/auth/password/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setNotice(data.message ?? "Check your email for the reset code.");
      setCode("");
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/password/reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setFieldErrors(data.fieldErrors ?? {});
        return;
      }

      setStep("done");
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
          <h2 className="text-lg font-semibold">Password updated</h2>
          <p className="text-sm text-muted-foreground">
            Sign in with your email and the new password.
          </p>
        </div>
        <Link href="/login" className={buttonVariants({ className: "w-full" })}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form className="space-y-4" onSubmit={resetPassword}>
        {notice ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Enter the code sent to{" "}
          <span className="font-medium text-foreground">{email}</span>
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
          error={fieldErrors.code}
          disabled={pending}
        />

        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          disabled={pending}
        />

        <Field
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
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

        <Button
          type="submit"
          className="w-full"
          disabled={pending || code.length !== 6 || !password}
        >
          {pending ? "Updating..." : "Set new password"}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-60"
            onClick={() => setStep("email")}
            disabled={pending}
          >
            Change email
          </button>
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-60"
            onClick={() => void sendCode()}
            disabled={pending}
          >
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={sendCode}>
      <Field
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
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
        {pending ? "Sending code..." : "Email me a reset code"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
