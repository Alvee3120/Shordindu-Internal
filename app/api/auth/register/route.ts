import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getDepartments } from "@/lib/settings";
import { getClientIp, readJsonBody } from "@/lib/http";
import { formatFieldErrors, requestRegisterSchema } from "@/lib/validators";
import { issueOtp, OtpRateLimitError } from "@/lib/otp";
import { queueOtpEmail } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  const parsed = requestRegisterSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the form and try again.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const { name, department, position, email, phone, password } = parsed.data;

  const departments = await getDepartments();
  if (!departments.includes(department)) {
    return NextResponse.json(
      {
        error: "Choose a valid department.",
        fieldErrors: { department: "Choose a valid department." },
      },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.emailVerifiedAt) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }
  if (existing && existing.status !== UserStatus.Pending) {
    return NextResponse.json(
      { error: "This email cannot be registered. Contact an administrator." },
      { status: 409 },
    );
  }

  let userId: string;
  const passwordHash = await hashPassword(password);
  if (existing) {
    // Let an unverified applicant correct their details and request a new code.
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { name, department, position, phone, passwordHash },
    });
    userId = updated.id;
  } else {
    const created = await prisma.user.create({
      data: {
        name,
        department,
        position,
        email,
        phone,
        passwordHash,
        status: UserStatus.Pending,
      },
    });
    userId = created.id;
    await logAudit({
      actorId: userId,
      action: "user.registered",
      targetType: "user",
      targetId: userId,
      afterJson: { name, email, department, position, status: UserStatus.Pending },
    });
  }

  try {
    const { code, expiresAt } = await issueOtp({
      email,
      purpose: "register",
      requestIp: getClientIp(request),
    });
    await queueOtpEmail({ to: email, code, purpose: "register", expiresAt });
  } catch (error) {
    if (error instanceof OtpRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  return NextResponse.json({
    message: "We sent a 6-digit code to your email.",
  });
}
