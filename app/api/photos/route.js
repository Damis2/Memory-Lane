import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { buildStoredFilename, saveMediaFile } from "@/lib/storage";
import Busboy from "busboy";
import { Readable } from "stream";
import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";

// Write temp upload files inside the project directory so the folder can
// be excluded from AV / OneDrive sync alongside the rest of the project,
// rather than landing in the OS-wide temp dir that users rarely exclude.
const TMP_DIR = path.join(process.cwd(), ".tmp-uploads");
// Eagerly create the tmp uploads dir when the module loads.
// mkdir is idempotent — safe to call even if the folder already exists.
mkdir(TMP_DIR, { recursive: true }).catch(() => {});

export const runtime = "nodejs";

const PAGE_SIZE = 30;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
  "video/x-matroska", // .mkv
  "video/x-msvideo", // .avi
]);

const IMAGE_MAX_BYTES = 25 * 1024 * 1024; // 25MB
const VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4GB — covers long videos too

function kindFor(mimeType) {
  if (IMAGE_TYPES.has(mimeType)) return "image";
  if (VIDEO_TYPES.has(mimeType)) return "video";
  return null;
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId"); // "uncategorized" is a special value
  const cursor = searchParams.get("cursor");
  const q = (searchParams.get("q") || "").trim();

  // Base filter by category
  let where =
    categoryId === "uncategorized" ? { categoryId: null } : categoryId ? { categoryId } : {};

  // Optionally layer in a text search across name, uploader, and category.
  // ILIKE is case-insensitive and works on any Postgres version.
  if (q) {
    where = {
      ...where,
      OR: [
        { originalName: { contains: q, mode: "insensitive" } },
        { uploader: { username: { contains: q, mode: "insensitive" } } },
        { category: { name: { contains: q, mode: "insensitive" } } },
      ],
    };
  }

  const photos = await prisma.photo.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { category: true, uploader: { select: { username: true } } },
  });

  const hasMore = photos.length > PAGE_SIZE;
  const page = hasMore ? photos.slice(0, PAGE_SIZE) : photos;

  return NextResponse.json({ photos: page, nextCursor: hasMore ? page[page.length - 1].id : null });
}

// Streams the incoming multipart body straight to a temp file on disk as
// it arrives, instead of buffering the whole upload in memory first —
// required to accept large/long videos without the server running out
// of RAM. Rejects unsupported types or over-limit files mid-stream.
function parseUpload(request) {
  return new Promise((resolve, reject) => {
    const contentType = request.headers.get("content-type") || "";
    if (!request.body) {
      resolve({ fields: {}, tempPath: null, mimeType: null, originalName: null, rejected: null });
      return;
    }

    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1 },
    });

    const fields = {};
    let tempPath = null;
    let mimeType = null;
    let originalName = null;
    let bytesWritten = 0;
    let rejected = null;
    let writeStream = null;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (_name, fileStream, info) => {
      mimeType = info.mimeType;
      originalName = info.filename;
      const kind = kindFor(mimeType);

      if (!kind) {
        rejected = "Only images (JPEG/PNG/WEBP/GIF) and videos (MP4/MOV/WEBM/MKV/AVI) are supported.";
        fileStream.resume();
        return;
      }

      const limit = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
      tempPath = path.join(TMP_DIR, `upload-${crypto.randomBytes(8).toString("hex")}`);
      writeStream = createWriteStream(tempPath);

      fileStream.on("data", (chunk) => {
        bytesWritten += chunk.length;
        if (bytesWritten > limit && !rejected) {
          rejected =
            kind === "image" ? "Image is larger than 25MB." : "Video is larger than the 4GB limit.";
          fileStream.unpipe(writeStream);
          writeStream.destroy();
          fileStream.resume();
        }
      });

      fileStream.pipe(writeStream);
    });

    busboy.on("finish", () => resolve({ fields, tempPath, mimeType, originalName, rejected }));
    busboy.on("error", reject);

    Readable.fromWeb(request.body).pipe(busboy);
  });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let parsed;
  try {
    parsed = await parseUpload(request);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Upload failed to process." }, { status: 400 });
  }

  const { fields, tempPath, mimeType, originalName, rejected } = parsed;

  if (!tempPath) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (rejected) {
    await unlink(tempPath).catch(() => {});
    return NextResponse.json({ error: rejected }, { status: 400 });
  }

  const kind = kindFor(mimeType);
  const categoryName = (fields.categoryName || "").trim();
  const aiTags = (fields.aiTags || "").trim();
  const aiConsent = fields.aiConsent === "true";

  let categoryId = null;
  if (categoryName) {
    const category = await prisma.category.upsert({
      where: { name: categoryName },
      update: {},
      create: { name: categoryName },
    });
    categoryId = category.id;
  }

  const storedFilename = buildStoredFilename(originalName || "upload");

  let size;
  let durationSeconds;
  try {
    const result = await saveMediaFile(tempPath, storedFilename, mimeType, kind);
    size = result.size;
    durationSeconds = result.durationSeconds;
  } catch (e) {
    await unlink(tempPath).catch(() => {});
    console.error(e);
    return NextResponse.json({ error: "Could not save the file." }, { status: 500 });
  }

  const photo = await prisma.photo.create({
    data: {
      filename: storedFilename,
      originalName: originalName || "upload",
      mimeType,
      kind,
      size,
      durationSeconds: durationSeconds ?? null,
      categoryId,
      aiTags: aiConsent && aiTags ? aiTags : null,
      aiConsent,
      uploaderId: user.userId,
    },
    include: { category: true, uploader: { select: { username: true } } },
  });

  return NextResponse.json(photo, { status: 201 });
}
