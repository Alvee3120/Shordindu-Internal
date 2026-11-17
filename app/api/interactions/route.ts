import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { commentTargetSchema } from "@/lib/validators";
import {
  commentCount,
  getReactionSummary,
} from "@/lib/interactions";
import { TargetType } from "@prisma/client";

/** Reaction summary and comment count for a feed/assignment card. */
export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const params = request.nextUrl.searchParams;
  const parsed = commentTargetSchema.safeParse({
    targetType: params.get("targetType") ?? "",
    targetId: params.get("targetId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid item." },
      { status: 400 },
    );
  }

  const targetType = parsed.data.targetType as TargetType;
  const [reactions, comments] = await Promise.all([
    getReactionSummary(targetType, parsed.data.targetId, user.id),
    commentCount(parsed.data.targetType, parsed.data.targetId),
  ]);

  return NextResponse.json({ reactions, commentCount: comments });
}
