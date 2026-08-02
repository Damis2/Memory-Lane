import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function Navbar({ username }) {
  return (
    <nav className="topbar" aria-label="Main navigation">
      <div className="topbar-inner">
        <Link href="/gallery" className="brand" aria-label="Memory Lane — go to gallery">
          <div className="brand-icon" aria-hidden="true">
            {/* Camera aperture icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v10M7 12h10" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <span>Memory Lane</span>
        </Link>

        {username ? (
          <div className="nav-links">
            <Link href="/gallery" className="nav-link">Gallery</Link>
            <Link href="/upload" className="nav-link">Upload</Link>
            <div className="nav-divider" aria-hidden="true" />
            <span className="nav-user" aria-label={`Signed in as ${username}`}>{username}</span>
            <LogoutButton />
          </div>
        ) : (
          <div className="nav-links">
            <Link href="/login" className="nav-link">Sign in</Link>
          </div>
        )}
      </div>
    </nav>
  );
}
