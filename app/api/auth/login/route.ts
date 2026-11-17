import { NextResponse, type NextRequest } from "next/server";
import { getClientIp, readJsonBody } from "@/lib/http";
import { formatFieldErrors, loginSchema } from "@/lib/validators";
import { loginWithPassword } from "@/lib/login";
import {
  accountStatusMessage,
  issueSession,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check your email and password.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const outcome = await loginWithPassword({
    email,
    password,
    ip: getClientIp(request),
  });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case "locked":
        return NextResponse.json(
          { error: "Too many failed attempts. Try again in 15 minutes." },
          { status: 429 },
        );
      case "inactive":
        return NextResponse.json(
          { status: outcome.status, error: accountStatusMessage(outcome.status) },
          { status: 403 },
        );
      case "no-role":
        return NextResponse.json(
          { error: "Your account is not ready. Please contact an administrator." },
          { status: 403 },
        );
      default:
        return NextResponse.json(
          { error: "Invalid email or password." },
          { status: 401 },
        );
    }
  }

  const { token, expiresAt } = await issueSession(outcome.user.id);
  setSessionCookie(token, expiresAt);

  return NextResponse.json({ status: outcome.user.status, message: "Signed in." });
}
