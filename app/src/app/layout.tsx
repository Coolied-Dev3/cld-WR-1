import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "クーリード 週報管理システム",
  description: "クーリード株式会社 週報管理システム",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
