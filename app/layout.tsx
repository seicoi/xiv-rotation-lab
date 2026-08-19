import type { Metadata } from "next";
import "./globals.css";
import "./extra.css";

const pagesBasePath = (process.env.PAGES_BASE_PATH || "").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PAGES_ORIGIN || "http://localhost:3000"),
  title: "XIV Rotation Lab",
  description: "FFXIVのローテーションを組み、期待値と実戦DPSを比較するシミュレーター。",
  openGraph: {
    title: "XIV Rotation Lab",
    description: "FFXIVのローテーションを組み、期待値と実戦DPSを比較するシミュレーター。",
    images: [`${pagesBasePath}/og.png`],
  },
  twitter: {
    card: "summary_large_image",
    title: "XIV Rotation Lab",
    description: "FFXIV DPS Simulator",
    images: [`${pagesBasePath}/og.png`],
  },
  icons: {
    icon: `${pagesBasePath}/favicon.svg`,
    shortcut: `${pagesBasePath}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
