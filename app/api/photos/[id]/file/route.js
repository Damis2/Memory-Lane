import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { readThumbnail, streamFileFromStorage, getFileMeta } from "@/lib/storage";
import { Readable } from "stream";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";
  const wantsThumb = searchParams.get("thumb") === "1" && !download;

  if (wantsThumb) {
    const thumbBuffer = await readThumbnail(photo.filename);
    if (thumbBuffer) {
      return new NextResponse(thumbBuffer, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400, immutable",
        },
      });
    }
    // No thumbnail (e.g. extraction failed) — fall through to the original.
  }

  const { size } = await getFileMeta(photo.filename);
  const headers = new Headers();
  headers.set("Content-Type", photo.mimeType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=86400, immutable");
  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${photo.originalName.replace(/"/g, "")}"`);
  }

  // Videos are requested in byte ranges by the browser so it can seek
  // without downloading the whole file — this is what makes scrubbing a
  // long video work instead of buffering it entirely up front.
  const rangeHeader = request.headers.get("range");
  if (rangeHeader && !download) {
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    const start = match ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : size - 1;

    const nodeStream = await streamFileFromStorage(photo.filename, { start, end });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));

    return new NextResponse(Readable.toWeb(nodeStream), { status: 206, headers });
  }

  const nodeStream = await streamFileFromStorage(photo.filename);
  headers.set("Content-Length", String(size));
  return new NextResponse(Readable.toWeb(nodeStream), { headers });
}
