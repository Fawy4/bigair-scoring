import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Organiser" };
export const dynamic = "force-dynamic";

export default async function OrganiserHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/org/login");

  const { data: memberships } = await supabase.from("memberships").select("role, organisations(id, name, slug)");
  const { data: events } = await supabase.from("events").select("id, name, slug, status, start_date").order("start_date", { ascending: false });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 text-[#111]">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold">Organiser</h1>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" size="lg" className="border-2 border-[#111] font-bold">
            Sign out
          </Button>
        </form>
      </header>
      <p className="text-lg font-semibold">Signed in as {user.email}</p>
      <section>
        <h2 className="text-xl font-bold">Your organisations</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {(memberships ?? []).map((m) => (
            <li key={m.organisations?.id} className="rounded-lg border-2 border-[#111] p-3 text-lg font-semibold">
              {m.organisations?.name} <span className="font-normal">({m.role})</span>
            </li>
          ))}
          {(memberships ?? []).length === 0 ? <li className="text-lg">You are not a member of any organisation yet.</li> : null}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-bold">Events</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {(events ?? []).map((e) => (
            <li key={e.id} className="rounded-lg border-2 border-[#111] p-3 text-lg font-semibold">
              {e.name} <span className="font-normal">· {e.status} · /{e.slug}</span>
            </li>
          ))}
          {(events ?? []).length === 0 ? <li className="text-lg">No events yet. Creating events arrives with the organiser screens in Phase 4.</li> : null}
        </ul>
      </section>
    </main>
  );
}
