import Link from "next/link";
import { notFound } from "next/navigation";
import { LivePoll } from "@/components/public/poll";
import { Logo } from "@/components/public/logo";
import { PublicNav } from "@/components/public/nav";
import { WindBanner } from "@/components/public/wind-banner";
import { loadSite } from "@/lib/public/load";
import { tabSettingsOf } from "@/lib/public/tab-guard";
import { visiblePublicTabs } from "@/lib/public/tabs";
import { formatEventDates } from "@/lib/platform/event-label";
import { copy } from "@/lib/ui-copy";

/**
 * The frame of the public event site: event name and logo, the wind-call banner, the page tabs, and the poll that keeps every page fresh. Everything below it reads
 * through the public functions as a visitor (no login anywhere on the public site).
 */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) notFound();
  const base = `/e/${site.event.slug}`;
  const N = copy.pub.nav;
  const items = visiblePublicTabs(tabSettingsOf(site)).map((t) => ({ href: `${base}${t.path}`, label: t.label }));
  const dates = formatEventDates(site.event.start_date, site.event.end_date);
  const logo = site.branding.logoUrl ?? site.organisation.logo_url;
  return (
    <div data-testid="public-site" className="beach-day beach-text-normal min-h-screen bg-beach-bg text-beach-ink">
      <LivePoll seconds={site.settings.livePollSec} />
      <div className="mx-auto flex max-w-xl flex-col gap-2 px-3 pb-8 pt-3">
        <header className="flex items-center gap-3">
          {logo ? <Logo src={logo} alt={copy.publicSite.logoAlt(site.event.name)} height={44} maxWidth={96} priority /> : null}
          <div className="min-w-0">
            <h1 data-testid="event-name" className="truncate text-heading font-semibold">
              <Link href={base} prefetch={false}>
                {site.event.name}
              </Link>
            </h1>
            <p className="truncate text-small font-medium text-beach-muted">{[site.event.location, dates].filter(Boolean).join(" · ")}</p>
          </div>
        </header>
        <WindBanner wind={site.wind} />
        <PublicNav items={items} label={N.menu} />
        <main className="flex flex-col gap-3">{children}</main>
      </div>
    </div>
  );
}
