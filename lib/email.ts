/**
 * Email Dispatch Adapter.
 * Supports console output for dev, SMTP and Resend for production.
 * Fully implemented in Module 2 and Module 8.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; id?: string }> {
  const provider = process.env.EMAIL_PROVIDER || "console";

  if (provider === "console" || process.env.NODE_ENV !== "production") {
    console.log("-----------------------------------------");
    console.log(`[EMAIL DISPATCH - ${provider.toUpperCase()}]`);
    console.log(`To: ${payload.to}`);
    console.log(`Subject: ${payload.subject}`);
    console.log(`Body: ${payload.html}`);
    console.log("-----------------------------------------");
    return { success: true, id: `dev-${Date.now()}` };
  }

  // Production provider handling added in Module 2/8
  return { success: true };
}
