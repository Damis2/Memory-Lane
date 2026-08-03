import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_EMOJIS = new Set(["❤️", "😂", "🔥", "👏", "😮"]);

// GET — reaction counts for a photo + which ones the current user has set
export async function GET(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const reactions = await prisma.reaction.findMany({
    where: { photoId: params.id },
    select: { emoji: true, userId: true },
  });

  // Aggregate counts
  const counts = {};
  const mine = [];
  for (const r of reactions) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (r.userId === user.userId) mine.push(r.emoji);
  }

  return NextResponse.json({ counts, mine });
}

// POST — toggle a reaction (add if absent, remove if present)
export async function POST(request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { emoji } = await request.json().catch(() => ({}));
  if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
    return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });
  }

  const photo = await prisma.photo.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const existing = await prisma.reaction.findUnique({
    where: { photoId_userId_emoji: { photoId: params.id, userId: user.userId, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({ data: { photoId: params.id, userId: user.userId, emoji } });
  }

  // Return updated counts
  const all = await prisma.reaction.findMany({
    where: { photoId: params.id },
    select: { emoji: true, userId: true },
  });
  const counts = {};
  const mine = [];
  for (const r of all) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (r.userId === user.userId) mine.push(r.emoji);
  }

  return NextResponse.json({ counts, mine });
}
