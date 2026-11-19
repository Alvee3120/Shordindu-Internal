import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { profileNameSchema } from "@/lib/validators";
import { getProfile, profileError, updateProfileName } from "@/lib/profile";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const profile = await getProfile(user.id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  return NextResponse.json({ profile });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = profileNameSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check your name." },
      { status: 400 },
    );
  }

  const result = await updateProfileName(user, parsed.data.name);
  if (!result.ok) {
    const { status, message } = profileError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    profile: result.data,
    message: "Name updated.",
  });
}
