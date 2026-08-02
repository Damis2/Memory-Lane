import "./globals.css";
import { Inter, IBM_Plex_Mono } from "next/font/google";

// next/font downloads and self-hosts fonts at build time — no runtime
// network request to fonts.googleapis.com, so pages don't block on an
// external CDN. Fonts are served as static assets from the same origin.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Contact Sheet — shared photo vault",
  description: "A private photo vault for you and your friends.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
