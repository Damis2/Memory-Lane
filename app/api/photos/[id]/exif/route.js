import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { readFileBuffer } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const photo = await prisma.photo.findUnique({
    where: { id: params.id },
    select: { filename: true, kind: true },
  });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Videos don't carry useful EXIF — return empty
  if (photo.kind === "video") return NextResponse.json({ exif: null });

  try {
    const exifr = (await import("exifr")).default;
    const buffer = await readFileBuffer(photo.filename);

    const raw = await exifr.parse(buffer, {
      pick: [
        "Make", "Model", "LensModel",
        "FNumber", "ExposureTime", "ISO",
        "FocalLength", "Flash",
        "DateTimeOriginal", "CreateDate",
        "GPSLatitude", "GPSLongitude", "GPSAltitude",
        "ImageWidth", "ImageHeight",
        "ExifImageWidth", "ExifImageHeight",
        "Orientation",
      ],
    }).catch(() => null);

    if (!raw) return NextResponse.json({ exif: null });

    // Build clean response
    const exif = {};

    if (raw.Make || raw.Model)
      exif.camera = [raw.Make, raw.Model].filter(Boolean).join(" ");
    if (raw.LensModel) exif.lens = raw.LensModel;
    if (raw.FNumber) exif.aperture = `f/${raw.FNumber}`;
    if (raw.ExposureTime)
      exif.shutter = raw.ExposureTime < 1
        ? `1/${Math.round(1 / raw.ExposureTime)}s`
        : `${raw.ExposureTime}s`;
    if (raw.ISO) exif.iso = `ISO ${raw.ISO}`;
    if (raw.FocalLength) exif.focalLength = `${raw.FocalLength}mm`;

    const dateTaken = raw.DateTimeOriginal || raw.CreateDate;
    if (dateTaken) exif.dateTaken = new Date(dateTaken).toISOString();

    const w = raw.ExifImageWidth || raw.ImageWidth;
    const h = raw.ExifImageHeight || raw.ImageHeight;
    if (w && h) exif.dimensions = `${w} × ${h}`;

    if (raw.GPSLatitude != null && raw.GPSLongitude != null) {
      exif.gps = { lat: raw.GPSLatitude, lng: raw.GPSLongitude };
    }

    return NextResponse.json({ exif });
  } catch {
    return NextResponse.json({ exif: null });
  }
}
