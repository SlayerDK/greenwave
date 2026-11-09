import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const SIGN_IN_PATH = "/login";

export const proxy = (request: NextRequest) => {
  const hasSession = getSessionCookie(request) !== null;
  if (hasSession) return NextResponse.next();

  const signInUrl = new URL(SIGN_IN_PATH, request.url);
  signInUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
};

/**
 * `api/cron` is excluded because its caller has no session: the redirect to
 * /login would turn every scheduled run into a 307, which `curl --fail` and
 * Vercel Cron both treat as success — a green run that recorded nothing.
 */
export const config = {
  matcher: [
    "/((?!api/auth|api/cron|login|signup|reset-password|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
