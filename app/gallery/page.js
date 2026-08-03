import { getSessionUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import GalleryClient from "@/components/GalleryClient";
import { prisma } from "@/lib/db";
import Link from "next/link"; // Use Next.js fast client-side router link

export const metadata = {
  title: "Gallery — Memory Lane",
  description: "Everything you and your friends have uploaded, in one place.",
};

export default async function GalleryPage() {
  const user = await getSessionUser();

  // Fast direct query without synthetic setTimeout latency
  let initialStorageBytes = null;
  try {
    const result = await prisma.photo.aggregate({
      _sum: { size: true },
    });
    initialStorageBytes = result._sum?.size ?? 0;
  } catch (err) {
    console.error("Failed to fetch storage stats:", err);
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
            {/* Next.js Link handles instant, zero-reload navigation */}
            <Link className="btn" href="/duplicates">
              Duplicates
            </Link>
            <Link className="btn btn-primary" href="/upload">
              + Upload
            </Link>
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