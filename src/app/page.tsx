import Link from "next/link";
import { BeachPage } from "@/components/beach-page";
import { EventCodeForm } from "@/components/event-code-form";
import { LandingEventCard, type LandingEvent } from "@/components/landing-event-card";
import { requestOrigin } from "@/lib/platform/origin";
import { groupOrgEvents } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { loadCore } from "@/lib/public/page-data";
import { todayIn } from "@/lib/schedule/plans";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";
import { PRODUCT_VERSION } from "@/lib/product-version";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const settings = await getPlatformSettings();
  const origin = await requestOrigin();
  const title = settings.productName;
  return {
    metadataBase: new URL(origin),
    title,
    description: settings.tagline,
    alternates: { canonical: origin },
    openGraph: { type: "website", url: origin, siteName: settings.productName, title: copy.landing.homeTitle(settings.productName), description: settings.tagline },
    twitter: { card: "summary_large_image", title: copy.landing.homeTitle(settings.productName), description: settings.tagline },
  };
}

const LIVE_LOOKUPS = 6;
const SHOWN = { upcoming: 40, recent: 8 };

/** What is on right now in a live event (for example "Pro Men · R1 · Heat 3"), read the way a visitor would; nothing when it cannot be read. */
async function nowOn(slug: string): Promise<string | null> {
  try {
    return (await loadCore(slug))?.tt.now?.title ?? null;
  } catch {
    return null;
  }
}

/** For riders and spectators: live events first, then upcoming, then recent results; one field for an event that is not listed. Simulation and archived events never appear (the database function leaves them out). */
export default async function Home() {
  const settings = await getPlatformSettings();
  const { data, error } = await (await createClient()).rpc("get_public_events", { p_limit: 100 });
  const events = (data ?? []) as LandingEvent[];
  const groups = groupOrgEvents(events, todayIn(settings.defaultTimezone, Date.now()));
  const live = groups.live;
  const nows = await Promise.all(live.slice(0, LIVE_LOOKUPS).map((e) => nowOn(e.slug)));
  const hasLegal = Boolean(settings.legalTexts.terms || settings.legalTexts.privacy);
  const section = (id: string, heading: string, list: LandingEvent[], nowLines?: Array<string | null>) =>
    list.length === 0 ? null : (
      <section aria-labelledby={id} className="flex flex-col gap-2" data-testid={id}>
        <h2 id={id} className="text-small font-semibold text-beach-muted">
          {heading}
        </h2>
        <ul className="flex flex-col gap-2">
          {list.map((e, i) => (
            <li key={e.id}>
              <LandingEventCard event={e} now={nowLines?.[i] ?? null} />
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <BeachPage testId="landing">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 pb-6 pt-8">
        <header className="flex flex-col gap-1">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt={copy.publicSite.logoAlt(settings.productName)} className="mb-1 h-12 max-w-[12rem] self-start object-contain" />
          ) : null}
          <h1 className="text-[20px] font-semibold leading-tight">{settings.productName}</h1>
          <p className="text-body font-medium text-beach-muted">{settings.tagline}</p>
        </header>

        {error ? (
          <p role="alert" className="rounded-card border border-beach-failed p-3 text-body font-semibold text-beach-failed">
            {copy.common.problem(copy.landing.loadError)}
          </p>
        ) : events.length === 0 ? (
          <p className="text-body font-medium text-beach-muted">{copy.landing.none}</p>
        ) : (
          <>
            {section("live-events", copy.landing.liveHeading, live, nows)}
            {section("upcoming-events", copy.landing.upcomingHeading, groups.upcoming.slice(0, SHOWN.upcoming))}
            {section("recent-events", copy.landing.recentHeading, groups.past.slice(0, SHOWN.recent))}
          </>
        )}

        <EventCodeForm />

        <p className="text-small font-medium text-beach-muted">
          {copy.landing.organiserQuestion}{" "}
          <Link href="/org/login" className="font-semibold text-beach-ink underline">
            {copy.landing.organiserLink}
          </Link>
          {" · "}
          {copy.landing.officialQuestion}{" "}
          <Link href="/join" className="font-semibold text-beach-ink underline">
            {copy.landing.officialLink}
          </Link>
        </p>

        <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-small font-medium text-beach-muted">
          <span>{settings.productName}</span>
          <span data-testid="product-version">{copy.manual.version(PRODUCT_VERSION)}</span>
          <Link href="/help" className="underline" data-testid="help-link">
            {copy.manual.footerHelp}
          </Link>
          {hasLegal ? (
            <Link href="/legal" className="underline">
              {copy.publicSite.legalLink}
            </Link>
          ) : null}
          <Link href="/org/login?next=%2Fadmin" className="ml-auto underline" data-testid="admin-link">
            {copy.landing.admin}
          </Link>
        </footer>
      </main>
    </BeachPage>
  );
}
