import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST — toggle favorite (add if not favorited, remove if already favorited)
export async function POST(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const photo = await prisma.photo.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const existing = await prisma.favorite.findUnique({
    where: { photoId_userId: { photoId: params.id, userId: user.userId } },
  });

  if (existing) {
    await prisma.favorite.delete({
      where: { photoId_userId: { photoId: params.id, userId: user.userId } },
    });
    return NextResponse.json({ favorited: false });
  } else {
    await prisma.favorite.create({ data: { photoId: params.id, userId: user.userId } });
    return NextResponse.json({ favorited: true });
  }
}
