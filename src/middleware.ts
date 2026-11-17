import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge gate: requests without a session cookie are sent to /login (pages) or get 401 (API).
 * The cookie is fully validated against the database in the server layout and in every API route.
 */
const PUBLIC_PATHS = ["/", "/login", "/forbidden", "/offline", "/api/auth/login", "/api/health"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  const hasSession = Boolean(req.cookies.get("sutra_session")?.value);
  if (hasSession) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Please sign in" } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|icons/|robots.txt).*)"],
};
