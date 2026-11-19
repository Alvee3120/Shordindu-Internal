import nodemailer from "nodemailer";

/**
 * Email transport adapter.
 * - development: always prints to the console
 * - production: SMTP or Resend, selected by EMAIL_PROVIDER
 */
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

async function sendViaResend(
  payload: EmailPayload,
): Promise<{ success: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "noreply@example.com",
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Resend failed (${response.status}): ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { id?: string };
  return { success: true, id: data.id };
}

async function sendViaSmtp(
  payload: EmailPayload,
): Promise<{ success: boolean; id?: string }> {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  const info = await transport.sendMail({
    from: process.env.SMTP_FROM ?? "noreply@example.com",
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  return { success: true, id: info.messageId };
}

export async function sendEmail(
  payload: EmailPayload,
): Promise<{ success: boolean; id?: string }> {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction || provider === "console") {
    console.log("-----------------------------------------");
    console.log(`[EMAIL DISPATCH - ${provider.toUpperCase()}]`);
    console.log(`To: ${payload.to}`);
    console.log(`Subject: ${payload.subject}`);
    console.log(`Body: ${payload.html}`);
    console.log("-----------------------------------------");
    return { success: true, id: `dev-${Date.now()}` };
  }

  if (provider === "resend") return sendViaResend(payload);
  if (provider === "smtp") return sendViaSmtp(payload);

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
    html: `<p>Hi ${name},</p><p>Your account has been approved with the <strong>${role}</strong> role.</p><p><a href="${loginUrl}">Sign in</a> with your email and password.</p>`,
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
    html: `<p>Hi ${name},</p><p>Your registration was not approved. Please contact your administrator if you think this is a mistake.</p>`,
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
    html: `<p>Hi ${name},</p><p>An account has been created for you.</p><p><a href="${resetUrl}">Set your password</a> using this email address, then sign in.</p>`,
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
    html: `<p>Hi ${name},</p><p>You have not posted a daily update for <strong>${date}</strong>.</p><p><a href="${link}">Post your update</a></p>`,
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
    html: `<p>Hi ${name},</p><p>This assignment is due today:</p><p><strong>${shortSummary}</strong></p><p><a href="${link}">Open the assignment</a></p>`,
  };
}

function escapeCalendarHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    html: [
      `<p>Hi ${escapeCalendarHtml(name)},</p>`,
      `<p>You have this on your calendar today:</p>`,
      `<p style="font-size:16px;font-weight:bold">${escapeCalendarHtml(title)}</p>`,
      notes?.trim()
        ? `<p>${escapeCalendarHtml(notes.trim())}</p>`
        : "",
      `<p><a href="${link}">Open your calendar</a></p>`,
    ].join(""),
  };
}
