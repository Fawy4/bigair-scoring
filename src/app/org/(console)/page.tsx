import Link from "next/link";
import { getOrgContext } from "@/lib/org/context";

export const metadata = { title: "Events" };

export default async function OrganiserHome() {
  const { supabase, current } = await getOrgContext();
  if (!current) {
    return <p className="panel text-lg font-semibold">You are not a member of any organisation yet. Ask the product owner to add you.</p>;
  }
  const { data: events } = await supabase
    .from("events")
    .select("id, name, slug, status, start_date")
    .eq("organisation_id", current.id)
    .order("start_date", { ascending: false, nullsFirst: true });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{current.name}: events</h1>
        <Link href="/org/events/new" className="btn btn-primary">
          + New event
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {(events ?? []).map((e) => (
          <li key={e.id} className="panel flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xl font-bold">{e.name}</p>
              <p className="font-semibold">
                {e.start_date ?? "No date yet"} · status: {e.status} · /{e.slug}
              </p>
            </div>
            <Link href={`/org/events/${e.id}/event`} className="btn">
              Open setup
            </Link>
          </li>
        ))}
        {(events ?? []).length === 0 ? <li className="panel text-lg font-semibold">No events yet. Press “New event” to start.</li> : null}
      </ul>
    </main>
  );
}
