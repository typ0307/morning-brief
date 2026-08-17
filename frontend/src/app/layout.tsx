import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모닝브리프",
  description: "출근길 뉴스 요약 브리핑",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  );
}
