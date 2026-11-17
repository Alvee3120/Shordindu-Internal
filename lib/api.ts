import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";

/** Returns the signed-in user, or a ready-made 401 response. */
export async function requireUserApi(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return user;
}

/** Returns the signed-in approver, or a ready-made 401/403 response. */
export async function requireApproverApi(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!canManageUsers(user.role)) {
    return NextResponse.json(
      { error: "You do not have access to this action." },
      { status: 403 },
    );
  }
  return user;
}

export function isApiResponse(
  value: SessionUser | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
