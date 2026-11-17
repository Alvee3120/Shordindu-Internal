import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireApproverApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { formatFieldErrors, createUserSchema } from "@/lib/validators";
import {
  createUserByAdmin,
  searchUsers,
  userManagementError,
} from "@/lib/user-management";
import { queueInviteEmail } from "@/lib/mailer";

export async function GET(request: NextRequest) {
  const actor = await requireApproverApi();
  if (isApiResponse(actor)) return actor;

  const search = request.nextUrl.searchParams.get("search") ?? "";
  const users = await searchUsers(search);
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const actor = await requireApproverApi();
  if (isApiResponse(actor)) return actor;

  const parsed = createUserSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the form and try again.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await createUserByAdmin(actor, parsed.data);
  if (!result.ok) {
    const { status, message } = userManagementError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  await queueInviteEmail({ to: result.data.email, name: result.data.name });

  return NextResponse.json(
    {
      user: result.data,
      message: "User added. An invite email has been sent.",
    },
    { status: 201 },
  );
}
