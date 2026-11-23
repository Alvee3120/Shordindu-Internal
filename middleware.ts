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

  // Build the redirect from the public host, not Next's internal origin
  // (which is localhost:3002 behind the nginx proxy).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : request.url;

  return NextResponse.redirect(new URL("/login", origin));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$|login(?:/|$)|register(?:/|$)|forgot-password(?:/|$)|api/auth(?:/|$)|api/health(?:/|$)).*)",
  ],
};
