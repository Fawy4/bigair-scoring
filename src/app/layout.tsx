import type { Metadata, Viewport } from "next";
import { getProductName } from "@/lib/platform/public-settings";
import { FeedbackGate } from "@/components/feedback/feedback-gate";
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
        <FeedbackGate />
      </body>
    </html>
  );
}
