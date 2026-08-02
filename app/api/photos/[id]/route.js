import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { deleteFileFromStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (photo.uploaderId !== user.userId) {
    return NextResponse.json(
      { error: "Only the person who uploaded a photo can delete it." },
      { status: 403 }
    );
  }

  await prisma.photo.delete({ where: { id: params.id } });
  await deleteFileFromStorage(photo.filename);

  return NextResponse.json({ ok: true });
}

// Re-categorize a photo — any authenticated user can do this on the
// shared vault (deliberate: it's a collaboration tool). Tighten by
// adding an uploaderId check here if you want uploader-only.
export async function PATCH(request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { categoryName } = await request.json();
  const trimmed = (categoryName || "").trim();

  let categoryId = null;
  if (trimmed) {
    const cat = await prisma.category.upsert({
      where: { name: trimmed },
      update: {},
      create: { name: trimmed },
    });
    categoryId = cat.id;
  }

  const updated = await prisma.photo.update({
    where: { id: params.id },
    data: { categoryId },
    include: { category: true, uploader: { select: { username: true } } },
  });

  return NextResponse.json(updated);
}
