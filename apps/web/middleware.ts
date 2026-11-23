import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that should only be accessible to authenticated users
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/tasks",
  "/goals",
  "/gym",
  "/nutrition",
  "/history",
  "/insights",
  "/reports",
  "/notifications",
  "/checkin",
];

export async function middleware(req: NextRequest) {
  // getToken reads the encrypted NextAuth JWT cookie.
  // We pass cookieName explicitly to handle both HTTP (dev) and HTTPS (prod).
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || "some-random-string",
    cookieName:
      req.nextUrl.protocol === "https:"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
  });

  const { pathname } = req.nextUrl;

  const userAgent = req.headers.get("user-agent") || "";
  const isDesktop = /lifeos-desktop|tauri/i.test(userAgent);

  // Desktop apps never see the marketing/landing page at `/`
  if (isDesktop && pathname === "/") {
    if (token) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // If trying to access a protected route without a session → redirect to /login
  if (isProtected && !token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes EXCEPT static files, _next internals, api routes, and icons
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|desktop-callback|desktop-login).*)",
  ],
};
