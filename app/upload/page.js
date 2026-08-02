import { getSessionUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import PhotoUploadForm from "@/components/PhotoUploadForm";

export const metadata = {
  title: "Upload — Contact Sheet",
  description: "Upload photos and videos to the shared vault.",
};

export default async function UploadPage() {
  const user = await getSessionUser();

  return (
    <>
      <Navbar username={user?.username} />
      <div className="frame">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Upload files</h1>
            <p>Add photos and videos — one at a time or a whole batch at once.</p>
          </div>
        </div>
        <div className="upload-page">
          <PhotoUploadForm />
        </div>
      </div>
    </>
  );
}
