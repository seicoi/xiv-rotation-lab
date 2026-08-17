import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./extra.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XIV Rotation Lab",
  description: "FFXIVのローテーションを組み、期待値と実戦DPSを比較するシミュレーター。",
  openGraph: {
    title: "XIV Rotation Lab",
    description: "FFXIVのローテーションを組み、期待値と実戦DPSを比較するシミュレーター。",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "XIV Rotation Lab",
    description: "FFXIV DPS Simulator",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
