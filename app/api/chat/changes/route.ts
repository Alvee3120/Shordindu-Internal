import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { chatChangesQuerySchema } from "@/lib/validators";
import { listChanges } from "@/lib/chat";

/**
 * Poll endpoint: everything that changed after the cursor — new messages,
 * edits and deletions. Keeps other clients in sync without a reload.
 */
export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const params = request.nextUrl.searchParams;
  const parsed = chatChangesQuerySchema.safeParse({
    since: params.get("since") || undefined,
    sinceId: params.get("sinceId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  }

  const delta = await listChanges(
    user,
    new Date(parsed.data.since),
    parsed.data.sinceId,
  );
  return NextResponse.json(delta);
}
