import { NextResponse, type NextRequest } from "next/server";
import { isApiResponse, requireUserApi } from "@/lib/api";
import { readJsonBody } from "@/lib/http";
import { formatFieldErrors, updateAnnouncementSchema } from "@/lib/validators";
import {
  announcementError,
  deleteAnnouncement,
  getAnnouncement,
  updateAnnouncement,
} from "@/lib/announcements";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const announcement = await getAnnouncement(user, params.id);
  if (!announcement) {
    return NextResponse.json(
      { error: "Announcement not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ announcement });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const parsed = updateAnnouncementSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the announcement.",
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const result = await updateAnnouncement(user, params.id, parsed.data);
  if (!result.ok) {
    const { status, message } = announcementError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    announcement: result.data,
    message: "Announcement updated.",
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUserApi();
  if (isApiResponse(user)) return user;

  const result = await deleteAnnouncement(user, params.id);
  if (!result.ok) {
    const { status, message } = announcementError(result.reason);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: "Announcement deleted." });
}
