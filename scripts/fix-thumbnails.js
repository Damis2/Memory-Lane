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
 * Usage:
 *   node scripts/fix-thumbnails.js
 *
 * Requires .env to be present and pointing at the live DATABASE_URL and
 * storage configuration (STORAGE_DRIVER / S3_* / UPLOAD_DIR).
 */

import "dotenv/config";
import path from "path";
import { tmpdir } from "os";
import { writeFile, unlink, readFile, mkdir } from "fs/promises";
import crypto from "crypto";
import sharp from "sharp";

// ── Prisma (read-only) ────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ── Storage helpers (mirrors lib/storage.js internals) ────────────────────────
const DRIVER = process.env.STORAGE_DRIVER || "local";
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const THUMB_WIDTH = 480;

function thumbKeyFor(storedFilename) {
  return `${storedFilename}.thumb.webp`;
}

// Local disk ─────────────────────────────────────────────────────────────────
async function localReadBuffer(key) {
  return readFile(path.join(UPLOAD_DIR, key));
}
async function localWriteBuffer(key, buffer) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, key), buffer);
}

// S3-compatible ──────────────────────────────────────────────────────────────
let _s3Client = null;
async function getS3Client() {
  if (_s3Client) return _s3Client;
  const { S3Client } = await import("@aws-sdk/client-s3");
  _s3Client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return _s3Client;
}
async function s3ReadBuffer(key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const res = await client.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })
  );
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function s3WriteBuffer(key, buffer, contentType) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

// Unified helpers ─────────────────────────────────────────────────────────────
async function readOriginal(key) {
  return DRIVER === "s3" ? s3ReadBuffer(key) : localReadBuffer(key);
}
async function writeThumb(key, buffer) {
  if (DRIVER === "s3") {
    await s3WriteBuffer(key, buffer, "image/webp");
  } else {
    await localWriteBuffer(key, buffer);
  }
}

// ── Video frame extraction (reuses lib/video.js logic) ───────────────────────
import { extractVideoFrame } from "../lib/video.js";

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const photos = await prisma.photo.findMany({
    select: { id: true, filename: true, mimeType: true, kind: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${photos.length} photo(s). Regenerating thumbnails…\n`);

  let fixed = 0;
  let failed = 0;

  for (const photo of photos) {
    try {
      let thumbBuffer;

      if (photo.kind === "video") {
        // Write original to a temp file so ffmpeg can read it
        const original = await readOriginal(photo.filename);
        const ext = path.extname(photo.filename) || ".mp4";
        const tmpPath = path.join(
          tmpdir(),
          `fix-thumb-${crypto.randomBytes(8).toString("hex")}${ext}`
        );
        await writeFile(tmpPath, original);
        try {
          const frame = await extractVideoFrame(tmpPath);
          thumbBuffer = await sharp(frame)
            .rotate()
            .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
            .webp({ quality: 70 })
            .toBuffer();
        } finally {
          await unlink(tmpPath).catch(() => {});
        }
      } else {
        // Image — read directly into sharp
        const original = await readOriginal(photo.filename);
        thumbBuffer = await sharp(original)
          .rotate()
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer();
      }

      await writeThumb(thumbKeyFor(photo.filename), thumbBuffer);
      console.log(`  ✓  ${photo.id}  (${photo.filename})`);
      fixed++;
    } catch (err) {
      console.error(`  ✗  ${photo.id}  (${photo.filename}): ${err.message}`);
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
