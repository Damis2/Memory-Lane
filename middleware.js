import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PATHS = ["/gallery", "/upload"];

function getSecretKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "");
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, getSecretKey());
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/gallery/:path*", "/upload/:path*"],
};
