import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

/**
 * First gate only: checks for a session cookie and keeps signed-out visitors
 * out. The cookie is verified against the database on every page and API route
 * that touches data (see lib/auth).
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login(?:/|$)|register(?:/|$)|forgot-password(?:/|$)|api/auth(?:/|$)|api/health(?:/|$)).*)",
  ],
};
