import { NextResponse, type NextRequest } from "next/server";
import { readJsonBody } from "@/lib/http";
import {
  otpFailureMessage,
  otpFailureStatus,
  verifyOtp,
} from "@/lib/otp";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const parsed = resetPasswordSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the form and try again." },
      { status: 400 },
    );
  }

  const { email, code, password } = parsed.data;
  const result = await verifyOtp({ email, purpose: "reset", code });
  if (!result.ok) {
    return NextResponse.json(
      { error: otpFailureMessage(result.reason) },
      { status: otpFailureStatus(result.reason) },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: "That code is invalid. Check the email and try again." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerifiedAt: user.emailVerifiedAt ?? now,
      },
    }),
    // Any other device must sign in again with the new password.
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.loginAttempt.deleteMany({ where: { email } }),
  ]);

  await logAudit({
    actorId: user.id,
    action: "user.password_reset",
    targetType: "user",
    targetId: user.id,
  });

  return NextResponse.json({
    status: user.status,
    message: "Your password has been updated.",
  });
}
