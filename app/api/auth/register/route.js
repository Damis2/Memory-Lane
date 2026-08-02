import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request) {
  // Rate limit: 5 registration attempts per 10 minutes per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, retryAfterMs } = checkRateLimit(`register:${ip}`, 5, 10 * 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  const { username, password, inviteCode } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // Optional shared invite code so randoms can't self-register on your
  // deployed site. Leave INVITE_CODE unset in .env to disable this check.
  const requiredCode = process.env.INVITE_CODE;
  if (requiredCode && inviteCode !== requiredCode) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { error: "That username is already taken." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, passwordHash },
  });

  await createSessionCookie(user.id, user.username);
  return NextResponse.json({ id: user.id, username: user.username });
}
