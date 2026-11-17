import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import {
  createUpdateSchema,
  formatFieldErrors,
  updateDateSchema,
} from "@/lib/validators";
import {
  createUpdate,
  getMyUpdateForDate,
  updateError,
} from "@/lib/updates";

export async function GET(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = updateDateSchema.safeParse(
    request.nextUrl.searchParams.get("date") ?? "",
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
  }

  const update = await getMyUpdateForDate(user.id, parsed.data);
  return NextResponse.json({ update });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = createUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the form.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await createUpdate(user, parsed.data);
  if (!result.ok) {
    const { status, message } = updateError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { update: result.data, message: "Update saved." },
    { status: 201 },
  );
}
