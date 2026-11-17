import {
  buildApprovalEmail,
  buildInviteEmail,
  buildOtpEmail,
  buildRejectionEmail,
  type EmailPayload,
} from "@/lib/email";
import { enqueueEmail } from "@/lib/queue";

/**
 * All email goes through the pg-boss queue. Web requests only enqueue jobs;
 * the worker performs the actual send.
 */

export async function queueEmail(payload: EmailPayload): Promise<void> {
  await enqueueEmail(payload);
}

export async function queueOtpEmail(args: {
  to: string;
  code: string;
  purpose: "register" | "reset";
  expiresAt: Date;
}): Promise<void> {
  await enqueueEmail(buildOtpEmail(args));
}

export async function queueApprovalEmail(args: {
  to: string;
  name: string;
  role: string;
}): Promise<void> {
  await enqueueEmail(buildApprovalEmail(args));
}

export async function queueRejectionEmail(args: {
  to: string;
  name: string;
}): Promise<void> {
  await enqueueEmail(buildRejectionEmail(args));
}

export async function queueInviteEmail(args: {
  to: string;
  name: string;
}): Promise<void> {
  await enqueueEmail(buildInviteEmail(args));
}
