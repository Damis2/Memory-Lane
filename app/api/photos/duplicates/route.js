import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Find all photos whose (originalName, size) pair appears more than once,
  // ordered so the oldest copy comes first within each group.
  const rows = await prisma.$queryRaw`
    SELECT
      p.id,
      p.filename,
      p."originalName",
      p."mimeType",
      p.kind,
      p.size,
      p."createdAt",
      p."categoryId",
      p."uploaderId",
      u.username AS "uploaderUsername",
      c.name     AS "categoryName"
    FROM "Photo" p
    JOIN "User" u ON u.id = p."uploaderId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE (p."originalName", p.size) IN (
      SELECT "originalName", size
      FROM   "Photo"
      GROUP  BY "originalName", size
      HAVING COUNT(*) > 1
    )
    ORDER BY p."originalName" ASC, p.size ASC, p."createdAt" ASC
  `;

  // Group into { key -> [photo, ...] }
  const groupMap = new Map();
  for (const row of rows) {
    const key = `${row.originalName}__${row.size}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push({
      id: row.id,
      filename: row.filename,
      originalName: row.originalName,
      mimeType: row.mimeType,
      kind: row.kind,
      size: Number(row.size),
      createdAt: row.createdAt,
      uploader: { username: row.uploaderUsername },
      category: row.categoryName ? { name: row.categoryName } : null,
    });
  }

  const groups = Array.from(groupMap.values());
  return NextResponse.json({ groups, totalDuplicateGroups: groups.length });
}
