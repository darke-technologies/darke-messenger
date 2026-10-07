import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../src/styles.css";

const TITLE = "DARKE | Zero-Cloud P2P Messaging Platform";
const DESCRIPTION =
  "The post-email P2P messaging platform for teams and privacy-focused professionals. E2EE messaging, direct node file transfers, zero-cloud storage, and free 1-on-1 chats forever.";
const OG_DESCRIPTION =
  "Replace email with bunker-grade P2P messaging. Free 1-on-1 chats forever, zero cloud storage.";
const SITE = "https://darke.ai";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    "P2P messaging, encrypted chat, email alternative, privacy messaging, zero-cloud chat, DARKE, direct node messaging",
  robots:
    "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  openGraph: {
    title: TITLE,
    description: OG_DESCRIPTION,
    type: "website",
    url: SITE,
    siteName: "DARKE",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: OG_DESCRIPTION,
  },
  icons: {
    icon: [{ url: "/darkefavicon.png", type: "image/png" }],
    shortcut: "/darkefavicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" data-theme="hud">
      <body>{children}</body>
    </html>
  );
}
