import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { reactionQuerySchema, reactionSchema } from "@/lib/validators";
import {
  getReactionSummary,
  interactionError,
  toggleReaction,
} from "@/lib/interactions";

export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const params = request.nextUrl.searchParams;
  const parsed = reactionQuerySchema.safeParse({
    targetType: params.get("targetType") ?? "",
    targetId: params.get("targetId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid item." },
      { status: 400 },
    );
  }

  const reactions = await getReactionSummary(
    parsed.data.targetType,
    parsed.data.targetId,
    user.id,
  );
  return NextResponse.json({ reactions });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = reactionSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That reaction is not supported." },
      { status: 400 },
    );
  }

  const result = await toggleReaction(
    user,
    parsed.data.targetType,
    parsed.data.targetId,
    parsed.data.emoji,
  );
  if (!result.ok) {
    const { status, message } = interactionError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ reactions: result.data });
}
