import type { Metadata } from "next";
import { loadArrowScheme } from "@/lib/live/arrow-loader";
import { copy } from "@/lib/ui-copy";
import { DesignPreview } from "./design-preview";

// Public, no login, and kept out of search engines: it is a look-and-feel preview with made-up riders (docs/06 §00.8).
export const metadata: Metadata = { title: copy.design.pageTitle, robots: { index: false, follow: false } };
// Reads the visitor's cookies (an Arrow organiser sees their own scheme), so it is never cached.
export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const arrow = await loadArrowScheme();
  return <DesignPreview arrow={arrow} />;
}
