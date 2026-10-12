import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import { getProductName } from "@/lib/platform/public-settings";
import { FeedbackGate } from "@/components/feedback/feedback-gate";
import "./globals.css";

// The brand font (the same as the Instagram posts). One variable file, Latin only: Bold for headings, names, heats, timers and scores, Regular/Medium for the rest.
const rubik = Rubik({ subsets: ["latin"], display: "swap", variable: "--font-rubik", fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"] });

export async function generateMetadata(): Promise<Metadata> {
  return { title: await getProductName() };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={rubik.variable}>
      <body>
        {children}
        <FeedbackGate />
      </body>
    </html>
  );
}
