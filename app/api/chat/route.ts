import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import {
  chatMessageListQuerySchema,
  formatFieldErrors,
  sendChatMessageSchema,
} from "@/lib/validators";
import { chatError, createMessage, listMessages } from "@/lib/chat";

export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const params = request.nextUrl.searchParams;
  const parsed = chatMessageListQuerySchema.safeParse({
    before: params.get("before") || undefined,
    limit: params.get("limit") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query." }, { status: 400 });
  }

  const page = await listMessages(user, {
    before: parsed.data.before,
    limit: parsed.data.limit,
  });
  return NextResponse.json(page);
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = sendChatMessageSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the message.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 }
    );
  }

  const result = await createMessage(
    user,
    parsed.data.content,
    parsed.data.replyToId
  );
  if (!result.ok) {
    const { status, message } = chatError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: result.data }, { status: 201 });
}
