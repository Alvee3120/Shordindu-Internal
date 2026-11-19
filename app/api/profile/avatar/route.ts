import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { avatarError, processAvatar } from "@/lib/avatar";
import {
  profileError,
  removeProfileAvatar,
  updateProfileAvatar,
} from "@/lib/profile";

/** Uploads a new profile picture. The server resizes it; the client's is ignored. */
export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send an image file." }, { status: 400 });
  }

  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Choose an image to upload." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const processed = await processAvatar(buffer, file.type);
  if (!processed.ok) {
    const { status, message } = avatarError(processed.reason);
    return NextResponse.json({ error: message }, { status });
  }

  const result = await updateProfileAvatar(user, processed.filename);
  if (!result.ok) {
    const { status, message } = profileError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    profile: result.data,
    message: "Profile picture updated.",
  });
}

/** Removes the current profile picture. */
export async function DELETE() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const result = await removeProfileAvatar(user);
  if (!result.ok) {
    const { status, message } = profileError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    profile: result.data,
    message: "Profile picture removed.",
  });
}
