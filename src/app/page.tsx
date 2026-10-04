import Link from "next/link";
import { Suspense } from "react";
import { HomeEventCode } from "@/components/home/home-event-code";
import { JumpArc } from "@/components/home/arc";
import { EventsView } from "@/components/home/events-view";
import type { LandingEvent } from "@/components/landing-event-card";
import "./home.css";
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

/** What is on right now in a live event (for example "Pro Men · R1 · Heat 3"), read the way a visitor would; nothing when it cannot be read. */
async function nowOn(slug: string): Promise<string | null> {
  try {
    return (await loadCore(slug))?.tt.now?.title ?? null;
  } catch {
    return null;
  }
}

const L = copy.landing;

/** The code field under the events (or under "No public events right now"): the same field either way. */
function CodeField() {
  return <HomeEventCode label={L.codeLabel} placeholder={L.codePlaceholder} go={L.codeGo} invalid={L.codeInvalid} />;
}

/** The events, streamed in after the hero: reads them as a visitor would (simulation and archived events are left out by the database function). */
async function Events() {
  const settings = await getPlatformSettings();
  const { data, error } = await (await createClient()).rpc("get_public_events", { p_limit: 100 });
  const events = (data ?? []) as LandingEvent[];
  const groups = groupOrgEvents(events, todayIn(settings.defaultTimezone, Date.now()));
  const nows = await Promise.all(groups.live.slice(0, LIVE_LOOKUPS).map((e) => nowOn(e.slug)));
  return <EventsView groups={groups} nowLines={nows} failed={Boolean(error)} />;
}

/** For riders and spectators. The hero (wordmark, tagline, the jump arc) does not wait for the events: the list streams in under it. */
export default async function Home() {
  const settings = await getPlatformSettings();
  const hasLegal = Boolean(settings.legalTexts.terms || settings.legalTexts.privacy);
  return (
    <div className="home" data-testid="landing">
      <main className="home-wrap">
        <header className="home-hero">
          <div>
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt={copy.publicSite.logoAlt(settings.productName)} className="home-logo" />
            ) : null}
            <h1 className="home-wordmark">{settings.productName}</h1>
            <p className="home-tagline">{settings.tagline}</p>
          </div>
          <JumpArc />
        </header>

        <Suspense fallback={<div className="home-skeleton" aria-hidden />}>
          <Events />
        </Suspense>

        <CodeField />

        <p className="home-quiet">
          {L.organiserQuestion}{" "}
          <Link href="/org/login" className="link">
            {L.organiserLink}
          </Link>
          {" · "}
          {L.officialQuestion}{" "}
          <Link href="/join" className="link">
            {L.officialLink}
          </Link>
        </p>

        <footer className="home-footer">
          <span data-testid="product-version">{copy.manual.version(PRODUCT_VERSION)}</span>
          <Link href="/help" prefetch={false} data-testid="help-link">
            {copy.manual.footerHelp}
          </Link>
          {hasLegal ? <Link href="/legal">{copy.publicSite.legalLink}</Link> : null}
          <Link href="/org/login?next=%2Fadmin" className="admin" data-testid="admin-link">
            {L.admin}
          </Link>
        </footer>
      </main>
    </div>
  );
}
