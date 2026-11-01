import type { Metadata, Viewport } from "next";
import { LiffProvider } from "@/components/LiffProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SHOP_NAME ? `${process.env.NEXT_PUBLIC_SHOP_NAME}` : "【Basic】ご来店予約",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#06c755",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <LiffProvider>{children}</LiffProvider>
      </body>
    </html>
  );
}
