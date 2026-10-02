import type { Metadata } from "next";
import { orgCopy } from "@/lib/ui-copy";
import { OrganiserPreview } from "./organiser-preview";

// Public, no login, kept out of search engines: a look-and-feel preview of the organiser screens with a made-up event. It reads nothing from the database and saves nothing.
export const metadata: Metadata = { title: orgCopy.page.title, robots: { index: false, follow: false } };

export default function OrganiserDesignPage() {
  return <OrganiserPreview />;
}
