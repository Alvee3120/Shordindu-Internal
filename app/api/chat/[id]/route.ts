import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { formatFieldErrors, sendChatMessageSchema } from "@/lib/validators";
import { chatError, deleteMessage, editMessage } from "@/lib/chat";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = sendChatMessageSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the message.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await editMessage(user, params.id, parsed.data.content);
  if (!result.ok) {
    const { status, message } = chatError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: result.data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const result = await deleteMessage(user, params.id);
  if (!result.ok) {
    const { status, message } = chatError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: "Message deleted." });
}
