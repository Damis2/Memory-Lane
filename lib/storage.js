import { mkdir, stat, rename, copyFile, unlink } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { extractVideoFrame, getVideoDurationSeconds } from "./video";

// Two drivers, picked with STORAGE_DRIVER:
//  - "local" (default): files live in UPLOAD_DIR on disk. Needs a
//    persistent volume on your host — see README.
//  - "s3": files go to any S3-compatible bucket (AWS S3, Cloudflare R2,
//    Backblaze B2, etc). Recommended once you're storing a lot of photos
//    and videos, since it scales independently of the app server.
const DRIVER = process.env.STORAGE_DRIVER || "local";
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const THUMB_WIDTH = 480;

export function buildStoredFilename(originalName) {
  const ext = path.extname(originalName || "") || "";
  const randomName = crypto.randomBytes(16).toString("hex");
  return `${randomName}${ext}`;
}

function thumbKeyFor(storedFilename) {
  return `${storedFilename}.thumb.webp`;
}

// ---------- local disk driver ----------
async function localMoveFromTemp(tempPath, key) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, key);
  try {
    await rename(tempPath, dest); // fast path: same filesystem
  } catch {
    await copyFile(tempPath, dest); // fallback: crosses filesystems (e.g. tmpfs)
    await unlink(tempPath).catch(() => {});
  }
}
async function localWriteBuffer(key, buffer) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const { writeFile } = await import("fs/promises");
  await writeFile(path.join(UPLOAD_DIR, key), buffer);
}
async function localReadBuffer(key) {
  const { readFile } = await import("fs/promises");
  return readFile(path.join(UPLOAD_DIR, key));
}
async function localStat(key) {
  return stat(path.join(UPLOAD_DIR, key));
}
function localStream(key, range) {
  return createReadStream(path.join(UPLOAD_DIR, key), range);
}
async function localDelete(key) {
  await unlink(path.join(UPLOAD_DIR, key)).catch(() => {});
}

// ---------- S3-compatible driver ----------
let s3Client = null;
async function getS3Client() {
  if (s3Client) return s3Client;
  const { S3Client } = await import("@aws-sdk/client-s3");
  s3Client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined, // needed for R2/B2, omit for AWS
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}
async function s3WriteBuffer(key, buffer, contentType) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  await client.send(
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: contentType })
  );
}
// Streams straight from a temp file, so a multi-gigabyte video is never
// held fully in memory during upload to the bucket.
async function s3WriteStreamFromFile(key, filePath, contentType) {
  const { Upload } = await import("@aws-sdk/lib-storage");
  const client = await getS3Client();
  const uploader = new Upload({
    client,
    params: {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
    },
  });
  await uploader.done();
}
async function s3ReadBuffer(key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function s3Stat(key) {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const res = await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  return { size: res.ContentLength };
}
async function s3Stream(key, range) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const rangeHeader = range ? `bytes=${range.start}-${range.end}` : undefined;
  const res = await client.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Range: rangeHeader })
  );
  return res.Body; // Node Readable stream
}
async function s3Delete(key) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })).catch(() => {});
}

// ---------- public API ----------

// Saves an uploaded file that's already been streamed to a local temp
// path (see the busboy parser in app/api/photos/route.js), generates a
// thumbnail (a resize for images, an extracted+resized frame for
// videos), moves/uploads the original to final storage, and cleans up
// the temp file. Returns the final size and, for videos, duration.
export async function saveMediaFile(tempPath, storedFilename, mimeType, kind) {
  const stats = await stat(tempPath);
  const size = stats.size;

  let thumbBuffer = null;
  let durationSeconds = null;
  try {
    if (kind === "video") {
      const [frame, duration] = await Promise.all([
        extractVideoFrame(tempPath),
        getVideoDurationSeconds(tempPath),
      ]);
      thumbBuffer = await sharp(frame).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
      durationSeconds = duration;
    } else {
      thumbBuffer = await sharp(tempPath).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
    }
  } catch (e) {
    // Best-effort: an unusual codec/format can fail extraction. The
    // original is still saved below; the UI falls back to no thumbnail.
    console.error("Thumbnail/duration extraction failed:", e.message);
  }

  if (DRIVER === "s3") {
    await s3WriteStreamFromFile(storedFilename, tempPath, mimeType);
    await unlink(tempPath).catch(() => {});
  } else {
    await localMoveFromTemp(tempPath, storedFilename);
  }

  if (thumbBuffer) {
    if (DRIVER === "s3") await s3WriteBuffer(thumbKeyFor(storedFilename), thumbBuffer, "image/webp");
    else await localWriteBuffer(thumbKeyFor(storedFilename), thumbBuffer);
  }

  return { size, durationSeconds };
}

export async function getFileMeta(storedFilename) {
  return DRIVER === "s3" ? s3Stat(storedFilename) : localStat(storedFilename);
}

// Returns a Node Readable for the ORIGINAL file, optionally scoped to a
// byte range — this is what makes video seeking/scrubbing work, since
// browsers request videos in ranges rather than all at once.
export async function streamFileFromStorage(storedFilename, range) {
  if (DRIVER === "s3") return s3Stream(storedFilename, range);
  return localStream(storedFilename, range ? { start: range.start, end: range.end } : undefined);
}

// Small helper for the thumbnail, which is always read whole (it's tiny).
export async function readThumbnail(storedFilename) {
  try {
    return DRIVER === "s3" ? await s3ReadBuffer(thumbKeyFor(storedFilename)) : await localReadBuffer(thumbKeyFor(storedFilename));
  } catch {
    return null;
  }
}

export async function deleteFileFromStorage(storedFilename) {
  if (DRIVER === "s3") {
    await s3Delete(storedFilename);
    await s3Delete(thumbKeyFor(storedFilename));
  } else {
    await localDelete(storedFilename);
    await localDelete(thumbKeyFor(storedFilename));
  }
}
