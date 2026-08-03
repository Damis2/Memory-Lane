import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import GalleryClient from "@/components/GalleryClient";

export async function generateMetadata({ params }) {
  return {
    title: `${params.username}'s uploads — Memory Lane`,
    description: `All photos and videos uploaded by ${params.username}.`,
  };
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default async function UserProfilePage({ params }) {
  const currentUser = await getSessionUser();
  if (!currentUser) redirect("/login");

  const profileUser = await prisma.user.findUnique({
    where: { username: params.username },
    select: {
      id: true,
      username: true,
      createdAt: true,
      _count: { select: { photos: true } },
    },
  });

  if (!profileUser) notFound();

  const storageAgg = await prisma.photo.aggregate({
    where: { uploaderId: profileUser.id },
    _sum: { size: true },
  });

  const totalBytes = storageAgg._sum.size ?? 0;

  return (
    <>
      <Navbar username={currentUser.username} />
      <div className="frame">
        {/* Profile header */}
        <div className="profile-header">
          <div className="profile-avatar">
            {profileUser.username[0].toUpperCase()}
          </div>
          <div className="profile-info">
            <h1>{profileUser.username}</h1>
            <div className="profile-stats">
              <span>{profileUser._count.photos.toLocaleString()} uploads</span>
              <span className="profile-stats-sep">·</span>
              <span>{formatBytes(totalBytes)} used</span>
              <span className="profile-stats-sep">·</span>
              <span>Joined {new Date(profileUser.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            </div>
          </div>
          <a className="btn" href="/gallery" style={{ marginLeft: "auto" }}>← Gallery</a>
        </div>

        {/* Their photos — reuse GalleryClient with uploader pre-filter */}
        <GalleryClient
          currentUsername={currentUser.username}
          initialStorageBytes={null}
          uploaderFilter={profileUser.username}
        />
      </div>
    </>
  );
}
