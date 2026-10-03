import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { loadSite } from "@/lib/public/load";
import { guardTab } from "@/lib/public/tab-guard";
import { publicMetadata } from "@/lib/public/meta";
import { requestOrigin } from "@/lib/platform/origin";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const LB = copy.pub.leaderboards;

async function load(slug: string, n: string) {
  const site = await loadSite(slug);
  const board = site?.settings.externalLeaderboards[Number(n) - 1];
  return site && board && /^\d+$/.test(n) ? { site, board } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const got = await load(slug, n);
  if (!got) return { title: copy.pub.common.notFound };
  return publicMetadata(await requestOrigin(), got.site, `/leaderboards/${n}`, { title: `${got.board.title} · ${got.site.event.name}`, description: got.site.event.name, image: { kind: "event" } }, `${got.board.title} · ${got.site.event.name}`);
}

/** An outside leaderboard (for example Highest Jump on WOO Events) as a tab: a link that opens it, or the page shown inside the site when the organiser chose that. */
export default async function ExternalLeaderboardPage({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const got = await load(slug, n);
  if (!got) notFound();
  guardTab(got.site, `leaderboard-${Number(n)}`);
  const { board } = got;
  return (
    <>
      <h2 data-testid="leaderboard-title" className="text-heading font-semibold">
        {board.title}
      </h2>
      <a data-testid="leaderboard-open" href={board.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-tap items-center gap-2 self-start rounded-xl border border-beach-accent bg-beach-accent px-3 text-body font-semibold text-beach-on-accent">
        <ExternalLink aria-hidden className="size-4" />
        {LB.open}
      </a>
      <p className="text-small font-medium text-beach-muted">{LB.opens}</p>
      {board.embed ? (
        <>
          <iframe data-testid="leaderboard-frame" src={board.url} title={board.title} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" className="h-[70vh] w-full rounded-card border border-beach-line bg-white" />
          <p className="text-small font-medium text-beach-muted">{LB.embedFallback}</p>
        </>
      ) : null}
    </>
  );
}
