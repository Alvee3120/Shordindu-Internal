import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import {
  commentTargetSchema,
  createCommentSchema,
  formatFieldErrors,
} from "@/lib/validators";
import {
  commentCount,
  createComment,
  interactionError,
  listComments,
} from "@/lib/interactions";

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

  const comments = await listComments(
    user.id,
    parsed.data.targetType,
    parsed.data.targetId,
  );
  return NextResponse.json({
    comments,
    commentCount: await commentCount(
      parsed.data.targetType,
      parsed.data.targetId,
    ),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = createCommentSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the comment.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await createComment(
    user,
    parsed.data.targetType,
    parsed.data.targetId,
    parsed.data.content,
  );
  if (!result.ok) {
    const { status, message } = interactionError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { comment: result.data, message: "Comment added." },
    { status: 201 },
  );
}
