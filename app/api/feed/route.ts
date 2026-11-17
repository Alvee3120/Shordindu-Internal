import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { feedQuerySchema } from "@/lib/validators";
import { decodeCursor, getFeed } from "@/lib/feed";

export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const params = request.nextUrl.searchParams;
  const parsed = feedQuerySchema.safeParse({
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    userId: params.get("userId") || undefined,
    department: params.get("department") || undefined,
    q: params.get("q") || undefined,
    cursor: params.get("cursor") || undefined,
    limit: params.get("limit") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid feed filters." },
      { status: 400 },
    );
  }

  const { cursor, limit, ...filters } = parsed.data;
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (cursor && !decoded) {
    return NextResponse.json(
      { error: "That page link is invalid. Reload the feed." },
      { status: 400 },
    );
  }

  const page = await getFeed(filters, decoded, limit ?? 10);
  return NextResponse.json(page);
}
