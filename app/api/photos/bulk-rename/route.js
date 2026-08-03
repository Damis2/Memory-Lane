import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 200;

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let renames;
  try {
    const body = await request.json();
    renames = body?.renames;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(renames) || renames.length === 0) {
    return NextResponse.json({ error: "renames must be a non-empty array." }, { status: 400 });
  }

  // Validate and normalise each entry
  const validated = [];
  for (const item of renames) {
    if (typeof item?.id !== "string" || !item.id) continue;
    const name = (typeof item.name === "string" ? item.name : "").trim();
    if (!name || name.length > MAX_NAME_LENGTH) continue;
    validated.push({ id: item.id, name });
  }

  if (validated.length === 0) {
    return NextResponse.json({ error: "No valid rename entries provided." }, { status: 400 });
  }

  const requestedIds = validated.map((v) => v.id);

  // Only rename photos the caller actually owns — skip any they don't own
  // rather than failing the whole batch.
  const owned = await prisma.photo.findMany({
    where: { id: { in: requestedIds }, uploaderId: user.userId },
    select: { id: true },
  });
  const ownedIdSet = new Set(owned.map((p) => p.id));
  const skippedIds = requestedIds.filter((id) => !ownedIdSet.has(id));

  const toRename = validated.filter((v) => ownedIdSet.has(v.id));
  const updatedIds = [];

  if (toRename.length > 0) {
    // Update each photo's originalName — only this column, never filename
    // (the storage key) or any other field.
    await prisma.$transaction(
      toRename.map(({ id, name }) =>
        prisma.photo.update({
          where: { id },
          data: { originalName: name },
        })
      )
    );
    updatedIds.push(...toRename.map((v) => v.id));
  }

  return NextResponse.json({ updatedIds, skippedIds });
}
