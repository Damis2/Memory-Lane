import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Sum the stored `size` column (bytes) across all photos.
  // Includes both original files and is accurate as long as thumbnails
  // aren't included in the Photo table (they aren't — thumbnails are
  // stored alongside originals but tracked separately in storage).
  const result = await prisma.photo.aggregate({
    _sum: { size: true },
    _count: { id: true },
  });

  return NextResponse.json({
    totalBytes: result._sum.size ?? 0,
    photoCount: result._count.id,
  });
}
