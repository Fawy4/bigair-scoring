import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_NAME } from "@/lib/product";

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
        <p className="mt-2 text-lg font-semibold">Live scoring for kitesurfing Big Air competitions.</p>
      </header>
      <nav aria-label="Main" className="flex flex-col gap-3">
        <Link href="/join" className={linkClass}>
          Officials: join with a PIN
        </Link>
        <Link href="/org/login" className={linkClass}>
          Organiser sign in
        </Link>
      </nav>
      <section aria-labelledby="events-heading">
        <h2 id="events-heading" className="text-2xl font-extrabold">
          Events
        </h2>
        {error ? (
          <p role="alert" className="mt-2 rounded-lg border-2 border-[#111] p-3 text-lg font-semibold">
            ✖ The event list could not be loaded just now. Try again in a minute.
          </p>
        ) : (events ?? []).length === 0 ? (
          <p className="mt-2 text-lg font-semibold">No events are published yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/e/${e.slug}/join`} className="block rounded-lg border-2 border-[#111] p-3 hover:bg-[#eee]">
                  <span className="block text-xl font-bold">{e.name}</span>
                  <span className="block text-base font-semibold">
                    {[e.location, e.start_date].filter(Boolean).join(" · ")}
                    {e.status === "live" ? " · ● LIVE now" : e.status === "complete" ? " · finished" : ""}
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
