import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth-edge";

// Routes that don't require a signed-in user.
const PUBLIC_PAGE_PATHS = ["/login", "/signup"];
const PUBLIC_API_PREFIXES = ["/api/auth"];

function isPublicPath(pathname) {
  if (PUBLIC_PAGE_PATHS.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = await verifyAuthToken(token);

  if (!payload) {
    // API routes get a JSON 401 instead of a redirect.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Pass the verified identity down to route handlers/pages via headers so
  // they don't need to re-verify the JWT themselves.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-user-email", payload.email || "");
  requestHeaders.set("x-user-name", payload.name || "");

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
