import Link from "next/link";
import { notFound } from "next/navigation";
import { EventCard, type PublicEvent } from "@/components/event-card";
import { groupOrgEvents, todayInZone } from "@/lib/platform/event-label";
import { isValidTimeZone } from "@/lib/schemas/org-settings";
import { createAnonClient } from "@/lib/supabase/anon";
import { requestOrigin } from "@/lib/platform/origin";
import { SiteFooter } from "@/components/home/site-chrome";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

interface PublicOrg {
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string | null;
  events: PublicEvent[];
}

async function load(slug: string): Promise<PublicOrg | null> {
  const { data } = await createAnonClient().rpc("get_public_organisation", { p_slug: slug });
  return (data as PublicOrg | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }) {
  const org = await load((await params).orgSlug);
  if (!org) return { title: copy.publicSite.eventNotFound };
  const origin = await requestOrigin();
  const description = copy.pub.og.eventDescription(org.name, "");
  return {
    metadataBase: new URL(origin),
    title: org.name,
    description,
    openGraph: { type: "website", url: `${origin}/o/${org.slug}`, title: org.name, description, ...(org.logo_url ? { images: [{ url: org.logo_url, alt: org.name }] } : {}) },
    twitter: { card: org.logo_url ? ("summary_large_image" as const) : ("summary" as const), title: org.name, description },
  };
}

/** An organisation's public page: logo, then live, upcoming and past published events. Archived organisations answer 404. */
export default async function PublicOrganisationPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const org = await load((await params).orgSlug);
  if (!org) notFound();
  const zone = org.timezone && isValidTimeZone(org.timezone) ? org.timezone : "Africa/Cairo";
  const groups = groupOrgEvents(org.events, todayInZone(zone));
  const c = copy.publicSite;

  const list = (events: PublicEvent[]) => (
    <ul className="mt-2 flex flex-col gap-2">
      {events.map((e) => (
        <li key={e.id}>
          <EventCard event={e} organisation={null} />
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-4 text-[#111]">
      <Link href="/" className="pt-4 font-bold underline">
        ← {c.backHome}
      </Link>
      <header className="flex flex-col items-center gap-3 text-center">
        {org.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt={c.logoAlt(org.name)} className="h-20 max-w-[14rem] object-contain" />
        ) : null}
        <h1 className="text-4xl font-extrabold">{org.name}</h1>
      </header>
      {groups.live.length > 0 ? (
        <section aria-labelledby="live-h">
          <h2 id="live-h" className="text-2xl font-extrabold">
            {c.liveHeading}
          </h2>
          {list(groups.live)}
        </section>
      ) : null}
      <section aria-labelledby="up-h">
        <h2 id="up-h" className="text-2xl font-extrabold">
          {c.upcomingHeading}
        </h2>
        {groups.upcoming.length > 0 ? list(groups.upcoming) : <p className="mt-2 text-lg font-semibold">{c.noUpcoming}</p>}
      </section>
      <section aria-labelledby="past-h">
        <h2 id="past-h" className="text-2xl font-extrabold">
          {c.pastHeading}
        </h2>
        {groups.past.length > 0 ? list(groups.past) : <p className="mt-2 text-lg font-semibold">{c.noPast}</p>}
      </section>
      <SiteFooter variant="beach" />
    </main>
  );
}
