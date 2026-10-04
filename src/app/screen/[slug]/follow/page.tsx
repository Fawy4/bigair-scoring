import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FollowScreen } from "@/components/public/follow-screen";
import { Qr } from "@/components/public/qr";
import { Updating } from "@/components/public/updating";
import { loadFollowPayload } from "@/lib/public/follow-load";
import { admitPublicRequest } from "@/lib/public/load";
import { loadCore } from "@/lib/public/page-data";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const F = copy.pub.follow;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const core = await loadCore((await params).slug);
  return { title: core ? `${F.title} · ${core.site.event.name}` : copy.pub.common.notFound, robots: { index: false, follow: false } };
}

/**
 * "Big screen — Follow the heat": the TV and projector page that stays on the heat while it runs and then walks back through the day's results and the ladder.
 * No login, no navigation, no Note or feedback button, no install prompt. The first paint is drawn here; the browser then asks /follow/data every second.
 */
export default async function FollowPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await admitPublicRequest())) return <Updating />;
  const slug = (await params).slug;
  const payload = await loadFollowPayload(slug);
  if (!payload) notFound();
  return <FollowScreen slug={slug} initial={payload} qr={<Qr url={payload.qrUrl} size={112} dark />} />;
}
