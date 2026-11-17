import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { verifyOtpSchema } from "@/lib/validators";
import {
  otpFailureMessage,
  otpFailureStatus,
  verifyOtp,
} from "@/lib/otp";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const parsed = verifyOtpSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That code is invalid. Check the email and try again." },
      { status: 400 },
    );
  }

  const { email, code } = parsed.data;
  const result = await verifyOtp({ email, purpose: "register", code });
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

  if (!user.emailVerifiedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    await logAudit({
      actorId: user.id,
      action: "user.email_verified",
      targetType: "user",
      targetId: user.id,
      beforeJson: { emailVerifiedAt: null },
      afterJson: { emailVerifiedAt: new Date().toISOString() },
    });
  }

  return NextResponse.json({
    status: user.status,
    message: "Email verified. Your account is waiting for approval.",
  });
}
