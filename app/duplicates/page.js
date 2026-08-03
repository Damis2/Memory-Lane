import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import DuplicatesClient from "@/components/DuplicatesClient";

export const metadata = {
  title: "Duplicates — Memory Lane",
  description: "Find and remove duplicate photos and videos.",
};

export default async function DuplicatesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <Navbar username={user.username} />
      <div className="frame">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Duplicate finder</h1>
            <p>Photos and videos with the same filename and file size.</p>
          </div>
          <div className="page-header-actions">
            <a className="btn" href="/gallery">← Back to gallery</a>
          </div>
        </div>
        <DuplicatesClient currentUsername={user.username} />
      </div>
    </>
  );
}
