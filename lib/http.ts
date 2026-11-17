import type { NextRequest } from "next/server";

/** Client IP for OTP rate limiting, honouring a reverse proxy in front of Next. */
export function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.ip ?? null;
}

/** Parses a JSON body, returning null instead of throwing on malformed input. */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
