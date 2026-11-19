import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { announcementSchema, formatFieldErrors } from "@/lib/validators";
import {
  announcementError,
  createAnnouncement,
  listAnnouncements,
} from "@/lib/announcements";

export async function GET() {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const announcements = await listAnnouncements(user);
  return NextResponse.json({ announcements });
}

export async function POST(request: NextRequest) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = announcementSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the announcement.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await createAnnouncement(user, parsed.data);
  if (!result.ok) {
    const { status, message } = announcementError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    { announcement: result.data, message: "Announcement posted." },
    { status: 201 },
  );
}
