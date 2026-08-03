#!/usr/bin/env node
/**
 * scripts/fix-thumbnails.js
 *
 * Regenerates the .thumb.webp thumbnail for every Photo row in the database,
 * applying EXIF orientation correction (sharp .rotate()) so sideways/upside-
 * down thumbnails from phone photos are fixed without touching the originals.
 *
 * Safe to run multiple times — idempotent (just re-writes thumbnails).
 * Never modifies, moves, or deletes original photo/video files.
 * Never writes to the Photo or User tables.
 *
 * Usage (from project root):
 *   node scripts/fix-thumbnails.js
 */

require("dotenv").config();

const path = require("path");
const os = require("os");
const fs = require("fs");
const { writeFile, unlink, readFile, mkdir } = require("fs/promises");
const crypto = require("crypto");
const { spawn } = require("child_process");
const sharp = require("sharp");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ── Storage config (mirrors lib/storage.js) ───────────────────────────────────
const DRIVER = process.env.STORAGE_DRIVER || "local";
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const THUMB_WIDTH = 480;

function thumbKeyFor(filename) {
  return `${filename}.thumb.webp`;
}

// ── Local driver ──────────────────────────────────────────────────────────────
async function localReadBuffer(key) {
  return readFile(path.join(UPLOAD_DIR, key));
}
async function localWriteBuffer(key, buffer) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const { writeFile: wf } = require("fs/promises");
  await wf(path.join(UPLOAD_DIR, key), buffer);
}

// ── S3 driver (lazy-loaded) ───────────────────────────────────────────────────
let _s3;
async function getS3() {
  if (_s3) return _s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  _s3 = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return _s3;
}
async function s3ReadBuffer(key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3();
  const res = await client.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })
  );
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function s3WriteBuffer(key, buffer) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "image/webp",
    })
  );
}

// ── Unified helpers ───────────────────────────────────────────────────────────
async function readOriginal(key) {
  return DRIVER === "s3" ? s3ReadBuffer(key) : localReadBuffer(key);
}
async function writeThumb(key, buffer) {
  if (DRIVER === "s3") await s3WriteBuffer(key, buffer);
  else await localWriteBuffer(key, buffer);
}

// ── ffmpeg frame extraction (mirrors lib/video.js) ────────────────────────────
const ffmpegPath = require("ffmpeg-static");

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    const chunks = [];
    let stderr = "";
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(stderr.slice(0, 400) || `ffmpeg exited ${code}`));
    });
    proc.on("error", reject);
  });
}

function buildFfmpegArgs(inputPath, seek) {
  return [
    "-ss", String(seek),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale=480:-1",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];
}

async function extractFrame(inputPath) {
  try {
    return await runFfmpeg(buildFfmpegArgs(inputPath, 1));
  } catch {
    return runFfmpeg(buildFfmpegArgs(inputPath, 0));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const photos = await prisma.photo.findMany({
    select: { id: true, filename: true, kind: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${photos.length} photo(s). Regenerating thumbnails…\n`);

  let fixed = 0;
  let failed = 0;

  for (const photo of photos) {
    try {
      let thumbBuffer;

      if (photo.kind === "video") {
        const original = await readOriginal(photo.filename);
        const ext = path.extname(photo.filename) || ".mp4";
        const tmpPath = path.join(
          os.tmpdir(),
          `fix-thumb-${crypto.randomBytes(8).toString("hex")}${ext}`
        );
        await writeFile(tmpPath, original);
        try {
          const frame = await extractFrame(tmpPath);
          thumbBuffer = await sharp(frame)
            .rotate()
            .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
            .webp({ quality: 70 })
            .toBuffer();
        } finally {
          await unlink(tmpPath).catch(() => {});
        }
      } else {
        const original = await readOriginal(photo.filename);
        thumbBuffer = await sharp(original)
          .rotate()
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer();
      }

      await writeThumb(thumbKeyFor(photo.filename), thumbBuffer);
      console.log(`  ✓  ${photo.id}`);
      fixed++;
    } catch (err) {
      console.error(`  ✗  ${photo.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Fixed: ${fixed}  Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
