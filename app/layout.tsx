import type { Metadata } from "next";
import "./globals.css";
import "./extra.css";
import "./ui-refresh.css";

const pagesBasePath = (process.env.PAGES_BASE_PATH || "").replace(/\/$/, "");
const description = "FFXIVのスキル回しを組み、DPS・ダメージ内訳・シミュレーション分布を比較。";
const socialImage = {
  url: `${pagesBasePath}/og.png?v=20260905`,
  width: 1731,
  height: 909,
  alt: "XIV Rotation Lab — FFXIV DPS Simulator",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PAGES_ORIGIN || "http://localhost:3000"),
  title: "XIV Rotation Lab",
  description,
  openGraph: {
    title: "XIV Rotation Lab",
    description,
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "XIV Rotation Lab",
    description,
    images: [socialImage],
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
