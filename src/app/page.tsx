import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const linkClass = "flex h-14 items-center justify-center rounded-md border-2 border-[#111] px-8 text-lg font-bold hover:bg-[#eee]";

export default async function Home() {
  const settings = await getPlatformSettings();
  // Published, live and finished events of active organisations only (a database function, so visitors never read the organisations table).
  const { data: events, error } = await (await createClient()).rpc("get_public_events", { p_limit: 30 });
  const hasLegal = Boolean(settings.legalTexts.terms || settings.legalTexts.privacy);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-4 text-[#111]">
      <header className="flex flex-col items-center gap-2 pt-10 text-center">
        {settings.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.logoUrl} alt={copy.publicSite.logoAlt(settings.productName)} className="h-16 max-w-[14rem] object-contain" />
        ) : null}
        <h1 className="text-4xl font-extrabold">{settings.productName}</h1>
        <p className="mt-2 text-lg font-semibold">{settings.tagline}</p>
      </header>
      <nav aria-label="Main" className="flex flex-col gap-3">
        <Link href="/join" className={linkClass}>
          {copy.landing.join}
        </Link>
        <Link href="/org/login" className={linkClass}>
          {copy.landing.organiser}
        </Link>
      </nav>
      <section aria-labelledby="events-heading">
        <h2 id="events-heading" className="text-2xl font-extrabold">
          {copy.landing.eventsHeading}
        </h2>
        {error ? (
          <p role="alert" className="mt-2 rounded-lg border-2 border-[#111] p-3 text-lg font-semibold">
            {copy.common.problem(copy.landing.loadError)}
          </p>
        ) : (events ?? []).length === 0 ? (
          <p className="mt-2 text-lg font-semibold">{copy.landing.none}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <EventCard event={e} organisation={e.organisation_name} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="mt-auto flex flex-col items-center gap-1 pb-6 text-center text-sm font-semibold">
        {hasLegal ? (
          <Link href="/legal" className="underline">
            {copy.publicSite.legalLink}
          </Link>
        ) : null}
        <span>{settings.productName}</span>
      </footer>
    </main>
  );
}
