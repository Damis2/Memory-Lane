import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { deleteFileFromStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let ids;
  try {
    const body = await request.json();
    ids = body?.ids;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array." }, { status: 400 });
  }

  // Find only the photos the caller actually owns — any ids they don't
  // own are silently skipped rather than erroring the whole batch.
  const owned = await prisma.photo.findMany({
    where: { id: { in: ids }, uploaderId: user.userId },
    select: { id: true, filename: true },
  });

  const ownedIds = owned.map((p) => p.id);
  const skippedIds = ids.filter((id) => !ownedIds.includes(id));

  if (ownedIds.length > 0) {
    // Single DB round-trip to delete all owned rows.
    await prisma.photo.deleteMany({ where: { id: { in: ownedIds } } });

    // Remove originals + thumbnails from storage in parallel.
    await Promise.all(owned.map((p) => deleteFileFromStorage(p.filename).catch(() => {})));
  }

  return NextResponse.json({ deletedIds: ownedIds, skippedIds });
}
