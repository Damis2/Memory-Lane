import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [categories, uncategorizedCount] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { photos: true } } },
    }),
    prisma.photo.count({ where: { categoryId: null } }),
  ]);
  return NextResponse.json({ categories, uncategorizedCount });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { name } = await request.json();
  const trimmed = (name || "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Category name is required." }, { status: 400 });
  }

  const category = await prisma.category.upsert({
    where: { name: trimmed },
    update: {},
    create: { name: trimmed },
  });
  return NextResponse.json(category);
}
