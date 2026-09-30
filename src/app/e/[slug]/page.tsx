import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEventDates } from "@/lib/platform/event-label";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await (await createClient()).rpc("get_public_event", { p_slug: slug });
  return { title: data?.[0]?.name ?? copy.publicSite.eventNotFound };
}

/** The public page of one event. Results, timetable and live scores arrive with the later phases; for now: who, where, when, and how officials join. */
export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await (await createClient()).rpc("get_public_event", { p_slug: slug });
  const event = data?.[0];
  if (!event) notFound();
  const dates = formatEventDates(event.start_date, event.end_date);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-4 text-[#111]">
      <Link href="/" className="pt-4 font-bold underline">
        ← {copy.publicSite.backHome}
      </Link>
      <h1 className="text-3xl font-extrabold">{event.name}</h1>
      <dl className="flex flex-col gap-2 text-lg font-semibold">
        <div>
          <dt className="inline font-bold">{copy.publicSite.orgLabel} </dt>
          <dd className="inline">
            <Link href={`/o/${event.organisation_slug}`} className="underline">
              {event.organisation_name}
            </Link>
          </dd>
        </div>
        {event.location ? (
          <div>
            <dt className="inline font-bold">{copy.publicSite.eventLocation} </dt>
            <dd className="inline">{event.location}</dd>
          </div>
        ) : null}
        {dates ? (
          <div>
            <dt className="inline font-bold">{copy.publicSite.eventDates} </dt>
            <dd className="inline">{dates}</dd>
          </div>
        ) : null}
      </dl>
      <Link href={`/e/${event.slug}/register`} className="flex h-14 items-center justify-center rounded-md bg-[#111] px-8 text-lg font-bold text-white">
        {copy.registration.join.link}
      </Link>
      <Link href={`/e/${event.slug}/join`} className="flex h-14 items-center justify-center rounded-md border-2 border-[#111] px-8 text-lg font-bold hover:bg-[#eee]">
        {copy.publicSite.joinAsOfficial}
      </Link>
    </main>
  );
}
