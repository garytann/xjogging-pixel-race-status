import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const socialImageUrl = `${siteUrl.replace(/\/$/, "")}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "xJogging Pixel Race Live",
  description: "A live pixel-art leaderboard for the HTX Annual Walk & Run 2026.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "xJogging Pixel Race Live",
    description: "Seven runners. One team. Follow the live distance leaderboard.",
    type: "website",
    images: [{ url: socialImageUrl, width: 1200, height: 630, alt: "xJogging Pixel Race Live" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "xJogging Pixel Race Live",
    description: "Seven runners. One team. Follow the live distance leaderboard.",
    images: [socialImageUrl],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07111f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
