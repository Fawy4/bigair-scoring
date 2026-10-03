import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlagView } from "@/components/public/flag-view";
import { loadFlagView } from "@/lib/public/flag-view";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await loadFlagView((await params).slug);
  return { title: p ? `${copy.flags.view.title} · ${p.eventName}` : copy.pub.common.notFound, robots: { index: false, follow: false } };
}

/** The flag marshal's screen: the whole screen is the flag. Public (the marshal has no login); it shows nothing but the flag, the heat and its riders. */
export default async function FlagPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const payload = await loadFlagView(slug);
  if (!payload) notFound();
  return <FlagView slug={slug} initial={payload} />;
}
