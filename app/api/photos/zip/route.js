import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { streamFileFromStorage } from "@/lib/storage";
import archiver from "archiver";
import { Readable } from "stream";

export const runtime = "nodejs";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { ids } = await request.json().catch(() => ({ ids: [] }));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No photo IDs provided." }, { status: 400 });
  }

  const photos = await prisma.photo.findMany({
    where: { id: { in: ids } },
    select: { id: true, filename: true, originalName: true },
  });

  if (photos.length === 0) {
    return NextResponse.json({ error: "No matching photos found." }, { status: 404 });
  }

  // Deduplicate filenames inside the zip (e.g. two files both named "IMG_001.jpg")
  const usedNames = new Map(); // name → count
  function uniqueName(originalName) {
    if (!usedNames.has(originalName)) {
      usedNames.set(originalName, 1);
      return originalName;
    }
    const count = usedNames.get(originalName) + 1;
    usedNames.set(originalName, count);
    const dot = originalName.lastIndexOf(".");
    if (dot < 0) return `${originalName} (${count})`;
    return `${originalName.slice(0, dot)} (${count})${originalName.slice(dot)}`;
  }

  // Create a streaming zip archive — entries are piped in one at a time
  // from storage so the entire zip is never buffered in memory.
  // This is safe for batches that include large videos.
  const archive = archiver("zip", { zlib: { level: 0 } }); // level 0 = no re-compression

  // Pipe each file from storage into the archive sequentially
  async function addEntries() {
    for (const photo of photos) {
      const entryName = uniqueName(photo.originalName);
      const fileStream = await streamFileFromStorage(photo.filename);
      archive.append(fileStream, { name: entryName });
    }
    archive.finalize();
  }

  addEntries().catch((e) => {
    console.error("Zip streaming error:", e);
    archive.abort();
  });

  // Convert the Node.js Readable (archiver output) to a Web ReadableStream
  // for the Next.js response.
  const webStream = Readable.toWeb(archive);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="contact-sheet-${Date.now()}.zip"`,
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-store",
    },
  });
}
