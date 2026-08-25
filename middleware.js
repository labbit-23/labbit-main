import { NextResponse } from "next/server";
import { unsealData } from "iron-session";
import { ironOptions, isSessionIdleExpired, REMEMBER_ME_MAX_AGE_SECONDS } from "@/lib/session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/user-login",
  "/api/verify-otp",
  "/api/send-otp",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
]);

function clearSessionCookie(response) {
  response.cookies.set(ironOptions.cookieName, "", {
    ...ironOptions.cookieOptions,
    maxAge: 0,
    path: "/",
  });
  return response;
}

function shouldCheckPath(pathname) {
  if (PUBLIC_PATHS.has(pathname)) return false;
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/favicon")) return false;
  if (pathname.includes(".")) return false;
  return true;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!shouldCheckPath(pathname)) return NextResponse.next();

  const sealedSession = request.cookies.get(ironOptions.cookieName)?.value;
  if (!sealedSession) return NextResponse.next();

  const session = await unsealData(sealedSession, {
    password: ironOptions.password,
    ttl: REMEMBER_ME_MAX_AGE_SECONDS,
  });

  if (!isSessionIdleExpired(session)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return clearSessionCookie(
      NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 })
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return clearSessionCookie(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
