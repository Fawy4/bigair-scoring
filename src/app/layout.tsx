import type { Metadata, Viewport } from "next";
import "./globals.css";

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "[PRODUCT_NAME]";

export const metadata: Metadata = { title: productName };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
