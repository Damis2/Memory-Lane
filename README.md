# Memory Lane — a private photo & video vault for you and your friends

A Next.js app built to handle a lot of media: sign up, upload photos and
videos (one at a time or a whole batch), sort into categories (by hand, or
with an optional in-browser AI suggester for photos), and download whatever
anyone's uploaded — individually or as a batch ZIP. The gallery loads in
pages and shows compressed thumbnails, so it stays fast whether there are 50
items or 50,000.

## Photos and videos

- **Photos**: JPEG, PNG, WEBP, GIF — up to 25 MB each.
- **Videos**: MP4, MOV, WEBM, MKV, AVI — up to 4 GB each, any length.
  Uploads are streamed straight to disk (or straight to your S3 bucket)
  as they arrive, rather than held in memory, so long/large files don't
  crash the server. A poster-frame thumbnail and the video's duration are
  extracted automatically with `ffmpeg`/`ffprobe`. Playback in the gallery
  uses byte-range streaming, so scrubbing through a long video doesn't
  require downloading the whole thing first.
- The optional AI tag suggester (see below) only works on still images —
  it's hidden automatically when you pick a video.

**A note on hosting large video uploads:** if you put this behind a reverse
proxy (Nginx, Cloudflare, some PaaS defaults), check its max request body
size — several default to 1–100 MB, which would reject a multi-GB video
before it reaches the app. Railway and Render don't impose a hard limit by
default; if you're on something else, look for a setting like
`client_max_body_size` (Nginx) or your platform's upload limit and raise it.

## Batch upload

The upload form accepts multiple files at once (drag-and-drop or the file
picker). You can mix photos and videos in the same batch.

- Set a **batch-level category** that applies to all files by default.
- Override the category **per file** if you need different albums in one
  upload.
- Each file uploads independently (serially, to avoid hammering the server
  with concurrent multi-GB video streams). A failed file shows an error
  badge without blocking the rest of the batch.
- The optional AI tag suggester is still per-image and still opt-in —
  click the button on each image card separately if you want suggestions.

## Batch download

In the gallery, hover over any photo card to reveal a checkbox. Select as
many as you like, then click **Download ZIP** in the bar that appears at the
bottom of the screen.

- The ZIP is streamed from the server — it's never fully buffered in memory,
  so batches that include large videos are safe to download.
- Individual file download (the existing `?download=1` link) still works too.

## Gallery features

- **Full-size lightbox** — click any thumbnail to open a full-screen
  viewer. Images load at original resolution; videos play using the same
  byte-range streaming as the gallery. Arrow keys and on-screen buttons
  navigate through the current page. Press Escape or click the backdrop to
  close.
- **Search** — type in the search box above the category filters to search
  by filename, category name, or uploader username.
- **Re-categorize** — click the pencil icon on any card to change its
  category without re-uploading. Leave the field blank to remove the
  category.
- **Storage indicator** — the gallery header shows total vault size.

## How categorization works

- **Manual** — type a category name when you upload (e.g. "Beach trip
  2026"). Existing category names autocomplete. In a batch upload, set a
  batch-level default and override per-file as needed.
- **AI (optional, off by default)** — on the upload screen there's a
  "Suggest tags with AI" button on each image card. Nothing runs until you
  click it. When you do, a small object-recognition model (MobileNet, via
  TensorFlow.js) downloads to *your own browser* and looks at *that one
  photo* locally. No image data is sent anywhere for this step — it's not
  an API call. You then pick which suggested tags, if any, get saved. If
  you never click the button, no AI ever touches your photos.

## Built for scale

- **Postgres**, not SQLite — handles many people uploading at once.
- **Streamed uploads** — the multipart body is piped straight to a temp
  file (and from there to final storage) instead of being buffered fully
  in memory, so large videos don't blow up server RAM.
- **Streamed ZIP downloads** — batch ZIP generation pipes files from
  storage through `archiver` without holding the full archive in memory.
- **Range-request streaming on playback** — videos are served with
  `Accept-Ranges`/`Content-Range` support, so the browser can seek without
  re-downloading the file.
- **Cursor-based pagination** on the gallery (`GET /api/photos`), with
  filtering by category and text search done server-side.
- **Thumbnails** — every photo gets a resized WEBP copy; every video gets a
  resized WEBP poster frame plus its duration. The grid only fetches
  thumbnails.
- **Pluggable storage** — local disk by default, or any S3-compatible bucket
  (S3, Cloudflare R2, Backblaze B2) via `STORAGE_DRIVER=s3`.
- **Rate limiting** — `/api/auth/login` (10 req/min) and
  `/api/auth/register` (5 req/10 min) are rate-limited per IP using an
  in-memory sliding window.

## Stack

- Next.js 14 (App Router, JavaScript)
- Prisma + Postgres
- Cookie-based sessions (JWT via `jose`), passwords hashed with `bcryptjs`
- `busboy` for streaming multipart uploads; `sharp` for image thumbnails;
  `ffmpeg-static`/`ffprobe-static` for video poster frames and duration;
  `archiver` for streaming ZIP generation
- Photos/videos served only through an authenticated route (not `/public`),
  with byte-range support for video playback
- TensorFlow.js + MobileNet, loaded client-side only, for optional AI tags
  on photos

## Run it locally

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL (see below) and SESSION_SECRET
#   openssl rand -base64 32   -> paste as SESSION_SECRET
npx prisma db push   # creates the tables
npm run dev
```

**Getting a Postgres URL without installing Postgres yourself:** create a
free database on [Neon](https://neon.tech) or [Supabase](https://supabase.com)
and copy the connection string they give you into `DATABASE_URL`. Takes about
two minutes.

Visit http://localhost:3000, create an account, and start uploading.

## Deploying

**Railway / Render / Fly.io (recommended)**
1. Push this folder to a GitHub repo.
2. Create a new web service from that repo.
3. Add a Postgres database (Railway/Render both offer one in a click) and
   set `DATABASE_URL` to it.
4. Set `SESSION_SECRET` and optionally `INVITE_CODE`.
5. Storage: either attach a persistent volume and leave
   `STORAGE_DRIVER=local`, or (recommended once photo volume is real) set
   `STORAGE_DRIVER=s3` and fill in the `S3_*` variables for a bucket
   (Cloudflare R2 has a generous free tier and no egress fees).
6. Build command: `npm run build`. Start command: `npm run start`.

**Vercel**
Vercel's filesystem is ephemeral, so `STORAGE_DRIVER=s3` is required there
(not optional) — anything written to local disk disappears between requests.
Use a hosted Postgres (Neon/Supabase) for `DATABASE_URL` and an
S3-compatible bucket for photos.

**No schema migrations needed** for this version — the Prisma schema is
unchanged from the initial release. Just run `npx prisma db push` on a fresh
database, or use an existing one.

## Inviting your friends

Set `INVITE_CODE` in your environment to a shared word/phrase and tell your
friends to enter it on the registration page. Leave it unset and anyone with
your URL can create an account.

## Project layout

```
app/
  login/, register/        sign-in pages
  gallery/                 paginated photo grid, search, category filters,
                           multi-select + batch download, lightbox viewer
  upload/                  batch upload form + per-file AI tag suggester
  api/
    auth/                  register (rate-limited), login (rate-limited), logout
    photos/                paginated list + search (GET), streaming upload (POST),
                           delete + re-categorize (DELETE/PATCH),
                           authenticated file-serving route (serves thumbnail
                           or original, byte-range aware)
    photos/zip/            streaming batch ZIP download (POST)
    categories/            list + create categories
    storage/stats/         total vault size (GET)
components/                Navbar, GalleryClient, PhotoUploadForm,
                           Toast, ConfirmDialog, LogoutButton
lib/                       auth, db, rateLimit, storage (local/S3 + thumbnails),
                           video (ffmpeg/ffprobe)
prisma/schema.prisma       User, Category, Photo models, with indexes
```
