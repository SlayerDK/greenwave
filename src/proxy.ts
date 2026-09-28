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

export const config = {
  matcher: [
    "/((?!api/auth|login|signup|reset-password|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
