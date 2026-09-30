import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_NAME } from "@/lib/product";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const linkClass = "flex h-14 items-center justify-center rounded-md border-2 border-[#111] px-8 text-lg font-bold hover:bg-[#eee]";

export default async function Home() {
  // Public read: RLS shows only published, live and finished events.
  const { data: events, error } = await (await createClient())
    .from("events")
    .select("id, name, slug, location, start_date, end_date, status")
    .in("status", ["published", "live", "complete"])
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(30);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-4 text-[#111]">
      <header className="pt-10 text-center">
        <h1 className="text-4xl font-extrabold">{PRODUCT_NAME}</h1>
        <p className="mt-2 text-lg font-semibold">{copy.landing.tagline}</p>
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
                <Link href={`/e/${e.slug}/join`} className="block rounded-lg border-2 border-[#111] p-3 hover:bg-[#eee]">
                  <span className="block text-xl font-bold">{e.name}</span>
                  <span className="block text-base font-semibold">
                    {[e.location, e.start_date].filter(Boolean).join(" · ")}
                    {e.status === "live" ? copy.landing.live : e.status === "complete" ? copy.landing.finished : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="mt-auto pb-6 text-center text-sm font-semibold">{PRODUCT_NAME}</footer>
    </main>
  );
}
