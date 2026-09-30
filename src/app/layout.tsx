import type { Metadata, Viewport } from "next";
import { getProductName } from "@/lib/platform/public-settings";
import { FeedbackButton } from "@/components/feedback/feedback-button";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getProductName() };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <FeedbackButton />
      </body>
    </html>
  );
}
