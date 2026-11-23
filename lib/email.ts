import nodemailer, { type Transporter } from "nodemailer";
import { claimEmailSlot, emailQuotaLimit } from "@/lib/email-quota";

/**
 * Email transport adapter.
 * - development: always prints to the console
 * - production: SMTP or Resend, selected by EMAIL_PROVIDER
 *
 * Sending is split across two provider accounts:
 * - "auth": OTP, invite, approval, rejection. Reserved for mail a user needs
 *   to sign in, so reminder bursts can never starve it.
 * - "bulk": reminders, digests, announcements.
 */
export type EmailAccount = "auth" | "bulk";

/**
 * "low" mail (notification digests) yields to "normal" mail once the account
 * nears its daily cap, so digests cannot consume the slots reminders need.
 */
export type EmailPriority = "normal" | "low";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  account?: EmailAccount;
  priority?: EmailPriority;
}

/** The provider answered explicitly and accepted nothing. A retry is safe. */
export class EmailRejectedError extends Error {
  constructor(
    message: string,
    readonly temporary: boolean,
  ) {
    super(message);
    this.name = "EmailRejectedError";
  }
}

/** The send may or may not have happened. Never resend automatically. */
export class EmailUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailUnknownError";
  }
}

/** The account has no slots left for today. Nothing was sent. */
export class EmailQuotaExceededError extends Error {
  constructor(readonly account: EmailAccount) {
    super(`Daily email quota reached for the "${account}" account.`);
    this.name = "EmailQuotaExceededError";
  }
}

/**
 * What the queue should do with a failed send:
 * - "retry": provider refused explicitly and may accept a later attempt
 * - "drop":  do not resend — either the outcome is unknown (it may already
 *            have been delivered) or the refusal is permanent
 */
export type EmailFailureAction = "retry" | "drop";

export function classifyEmailFailure(error: unknown): EmailFailureAction {
  if (error instanceof EmailUnknownError) return "drop";
  if (error instanceof EmailRejectedError) return error.temporary ? "retry" : "drop";
  if (error instanceof EmailQuotaExceededError) return "drop";
  return "retry";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Per-account credentials, falling back to the single SMTP_* set. */
function smtpConfig(account: EmailAccount): {
  user?: string;
  pass?: string;
  from: string;
} {
  const prefix = account === "auth" ? "SMTP_AUTH" : "SMTP_BULK";
  const user = process.env[`${prefix}_USER`] || process.env.SMTP_USER;
  const pass = process.env[`${prefix}_PASS`] || process.env.SMTP_PASS;
  const from =
    process.env[`${prefix}_FROM`] ||
    process.env.SMTP_FROM ||
    "noreply@example.com";
  return { user, pass, from };
}

/**
 * One pooled transport per account, reused for every message. Building a
 * transport per send opens a connection per email and trips provider rate
 * limits during a full-company reminder run.
 */
const transports = new Map<EmailAccount, Transporter>();

function smtpTransport(account: EmailAccount): Transporter {
  const cached = transports.get(account);
  if (cached) return cached;

  const { user, pass } = smtpConfig(account);
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS ?? 2),
    maxMessages: 100,
    auth: user ? { user, pass } : undefined,
  });

  transports.set(account, transport);
  return transport;
}

/** Forgets cached transports (tests swap credentials between cases). */
export function resetEmailTransports(): void {
  transports.forEach((transport) => transport.close());
  transports.clear();
}

function resendKey(account: EmailAccount): string | undefined {
  return account === "auth"
    ? process.env.RESEND_AUTH_API_KEY || process.env.RESEND_API_KEY
    : process.env.RESEND_BULK_API_KEY || process.env.RESEND_API_KEY;
}

async function sendViaResend(
  payload: EmailPayload,
  account: EmailAccount,
): Promise<{ success: boolean; id?: string }> {
  const apiKey = resendKey(account);
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  const prefix = account === "auth" ? "RESEND_AUTH_FROM" : "RESEND_BULK_FROM";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env[prefix] ||
        process.env.RESEND_FROM ||
        "noreply@example.com",
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const message = `Resend failed (${response.status}): ${detail}`;
    // 4xx is a definite refusal; 429 is a temporary refusal we may retry later.
    if (response.status >= 400 && response.status < 500) {
      throw new EmailRejectedError(message, response.status === 429);
    }
    // 5xx: the request may have been accepted before the error surfaced.
    throw new EmailUnknownError(message);
  }

  const data = (await response.json()) as { id?: string };
  return { success: true, id: data.id };
}

async function sendViaSmtp(
  payload: EmailPayload,
  account: EmailAccount,
): Promise<{ success: boolean; id?: string }> {
  const transport = smtpTransport(account);

  try {
    const info = await transport.sendMail({
      from: smtpConfig(account).from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    return { success: true, id: info.messageId };
  } catch (error) {
    const responseCode = (error as { responseCode?: number }).responseCode;
    const message = error instanceof Error ? error.message : String(error);

    // A numeric SMTP reply means the server told us the outcome explicitly.
    if (typeof responseCode === "number") {
      throw new EmailRejectedError(
        `SMTP ${responseCode}: ${message}`,
        responseCode >= 400 && responseCode < 500,
      );
    }

    // Socket error, timeout or dropped connection: the message may have been
    // accepted before the failure, so it must never be resent blindly.
    throw new EmailUnknownError(message);
  }
}

/**
 * Sends one email. Throws EmailQuotaExceededError when the account has used
 * its daily allowance, so callers can defer instead of losing the message.
 */
export async function sendEmail(
  payload: EmailPayload,
): Promise<{ success: boolean; id?: string }> {
  const account: EmailAccount = payload.account ?? "bulk";
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction || provider === "console") {
    console.log("-----------------------------------------");
    console.log(`[EMAIL DISPATCH - ${provider.toUpperCase()} / ${account.toUpperCase()}]`);
    console.log(`To: ${payload.to}`);
    console.log(`Subject: ${payload.subject}`);
    console.log(`Body: ${payload.html}`);
    console.log("-----------------------------------------");
    return { success: true, id: `dev-${Date.now()}` };
  }

  const limit = emailQuotaLimit(account);
  if (limit > 0) {
    const claimed = await claimEmailSlot(
      account,
      limit,
      payload.priority ?? "normal",
    );
    if (!claimed) throw new EmailQuotaExceededError(account);
  }

  if (provider === "resend") return sendViaResend(payload, account);
  if (provider === "smtp") return sendViaSmtp(payload, account);

  throw new Error(`Unknown EMAIL_PROVIDER "${provider}"`);
}

export function buildOtpEmail({
  to,
  code,
  purpose,
  expiresAt,
}: {
  to: string;
  code: string;
  purpose: "register" | "reset";
  expiresAt: Date;
}): EmailPayload {
  const minutes = Math.max(
    1,
    Math.round((expiresAt.getTime() - Date.now()) / 60000),
  );
  const isReset = purpose === "reset";
  const action = isReset ? "reset your password" : "verify your email";
  const subject = isReset
    ? "Your password reset code - Shordindu Internal"
    : "Your verification code - Shordindu Internal";
  const text = `Your code to ${action} is ${code}. It expires in ${minutes} minutes. If you did not request this, ignore this email.`;

  return {
    to,
    subject,
    text,
    account: "auth",
    html: [
      `<p>Your code to ${action} is:</p>`,
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>`,
      `<p>This code expires in ${minutes} minutes. If you did not request this, ignore this email.</p>`,
    ].join(""),
  };
}

export function buildApprovalEmail({
  to,
  name,
  role,
}: {
  to: string;
  name: string;
  role: string;
}): EmailPayload {
  const loginUrl = `${appUrl()}/login`;
  return {
    to,
    subject: "Your account has been approved - Shordindu Internal",
    text: `Hi ${name}, your account has been approved with the ${role} role. Sign in at ${loginUrl} with your email and password.`,
    account: "auth",
    html: `<p>Hi ${escapeHtml(name)},</p><p>Your account has been approved with the <strong>${escapeHtml(role)}</strong> role.</p><p><a href="${loginUrl}">Sign in</a> with your email and password.</p>`,
  };
}

export function buildRejectionEmail({
  to,
  name,
}: {
  to: string;
  name: string;
}): EmailPayload {
  return {
    to,
    subject: "Your registration was not approved - Shordindu Internal",
    text: `Hi ${name}, your registration was not approved. Please contact your administrator if you think this is a mistake.`,
    account: "auth",
    html: `<p>Hi ${escapeHtml(name)},</p><p>Your registration was not approved. Please contact your administrator if you think this is a mistake.</p>`,
  };
}

export function buildInviteEmail({
  to,
  name,
}: {
  to: string;
  name: string;
}): EmailPayload {
  const resetUrl = `${appUrl()}/forgot-password`;
  return {
    to,
    subject: "You have been added to Shordindu Internal",
    text: `Hi ${name}, an account has been created for you. Set your password at ${resetUrl} using this email address, then sign in.`,
    account: "auth",
    html: `<p>Hi ${escapeHtml(name)},</p><p>An account has been created for you.</p><p><a href="${resetUrl}">Set your password</a> using this email address, then sign in.</p>`,
  };
}

export function buildDailyReminderEmail({
  to,
  name,
  date,
}: {
  to: string;
  name: string;
  date: string;
}): EmailPayload {
  const link = `${appUrl()}/my-updates`;
  return {
    to,
    subject: `Reminder: post your daily update for ${date}`,
    text: `Hi ${name}, you have not posted a daily update for ${date}. Post it at ${link}`,
    account: "bulk",
    html: `<p>Hi ${escapeHtml(name)},</p><p>You have not posted a daily update for <strong>${escapeHtml(date)}</strong>.</p><p><a href="${link}">Post your update</a></p>`,
  };
}

export function buildAssignmentDueEmail({
  to,
  name,
  summary,
  link,
}: {
  to: string;
  name: string;
  summary: string;
  link: string;
}): EmailPayload {
  const shortSummary =
    summary.length > 100 ? `${summary.slice(0, 97)}...` : summary;
  return {
    to,
    subject: `Assignment due today: ${shortSummary}`,
    text: `Hi ${name}, this assignment is due today: ${shortSummary}. Open it at ${link}`,
    account: "bulk",
    html: `<p>Hi ${escapeHtml(name)},</p><p>This assignment is due today:</p><p><strong>${escapeHtml(shortSummary)}</strong></p><p><a href="${link}">Open the assignment</a></p>`,
  };
}

export function buildCalendarReminderEmail({
  to,
  name,
  title,
  notes,
  link,
}: {
  to: string;
  name: string;
  title: string;
  notes: string | null;
  link: string;
}): EmailPayload {
  const detail = notes?.trim() ? `\n\n${notes.trim()}` : "";
  return {
    to,
    subject: `Reminder today: ${title}`,
    text: `Hi ${name}, you have this on your calendar today: ${title}${detail}\n\nOpen your calendar: ${link}`,
    account: "bulk",
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      `<p>You have this on your calendar today:</p>`,
      `<p style="font-size:16px;font-weight:bold">${escapeHtml(title)}</p>`,
      notes?.trim()
        ? `<p>${escapeHtml(notes.trim())}</p>`
        : "",
      `<p><a href="${link}">Open your calendar</a></p>`,
    ].join(""),
  };
}
