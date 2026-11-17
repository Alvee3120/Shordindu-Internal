import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp, readJsonBody } from "@/lib/http";
import { requestPasswordResetSchema } from "@/lib/validators";
import { issueOtp, OtpRateLimitError } from "@/lib/otp";
import { queueOtpEmail } from "@/lib/mailer";

/**
 * Always answers the same way so it never reveals whether an email is
 * registered. Rate-limit errors are swallowed for the same reason.
 */
export async function POST(request: NextRequest) {
  const parsed = requestPasswordResetSchema.safeParse(
    await readJsonBody(request),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    try {
      const { code, expiresAt } = await issueOtp({
        email,
        purpose: "reset",
        requestIp: getClientIp(request),
      });
      await queueOtpEmail({ to: email, code, purpose: "reset", expiresAt });
    } catch (error) {
      if (!(error instanceof OtpRateLimitError)) throw error;
    }
  }

  return NextResponse.json({
    message: "If this email is registered, a reset code is on its way.",
  });
}
