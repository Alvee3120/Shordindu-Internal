import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { avatarDirectory } from "@/lib/avatar";

/**
 * Serves a stored avatar. Filenames are generated server-side (hex + .webp), so
 * only a strict pattern is accepted — no traversal, no other extensions.
 */
const SAFE_NAME = /^[a-f0-9]{32}\.webp$/;

export async function GET(
  _request: Request,
  { params }: { params: { file: string } },
) {
  const file = params.file;
  if (!SAFE_NAME.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const bytes = await readFile(path.join(avatarDirectory(), file));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/webp",
        // Filenames are content-unique, so this can be cached hard.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
