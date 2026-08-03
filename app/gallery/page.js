import { getSessionUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import GalleryClient from "@/components/GalleryClient";
import { prisma } from "@/lib/db";

export const metadata = {
  title: "Gallery — Memory Lane",
  description: "Everything you and your friends have uploaded, in one place.",
};

export default async function GalleryPage() {
  const user = await getSessionUser();

  // Pre-fetch storage stats server-side so the badge renders without a
  // client-side fetch flash. Uses a short timeout so a slow/cold DB
  // connection doesn't block the whole page — the client will re-fetch
  // it independently via /api/storage/stats anyway.
  let initialStorageBytes = null;
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 1000)
    );
    const query = prisma.photo.aggregate({ _sum: { size: true } });
    const result = await Promise.race([query, timeout]);
    initialStorageBytes = result._sum.size ?? 0;
  } catch {
    // Non-critical — client will fetch it
  }

  return (
    <>
      <Navbar username={user?.username} />
      <div className="frame">
        <div className="page-header">
          <div className="page-header-left">
            <h1>The vault</h1>
            <p>Everything you and your friends have uploaded, in one place.</p>
          </div>
          <div className="page-header-actions">
            <a className="btn" href="/duplicates">
              Duplicates
            </a>
            <a className="btn btn-primary" href="/upload">
              + Upload
            </a>
          </div>
        </div>
        <GalleryClient
          currentUsername={user?.username}
          initialStorageBytes={initialStorageBytes}
        />
      </div>
    </>
  );
}
