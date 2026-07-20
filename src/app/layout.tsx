import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ConfigureAmplify from "@/components/ConfigureAmplify";
import ThemeScript from "@/components/ThemeScript";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "レシピ共有",
  description: "レシピを保存し、家族で共有するためのアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning は ThemeScript とセット。
    // 描画前に data-theme を書き換えるため、サーバーの HTML と一致しない
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <ConfigureAmplify />
        {children}
      </body>
    </html>
  );
}
