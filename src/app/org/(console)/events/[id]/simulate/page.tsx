import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { getDb } from "@/lib/org/context";
import { loadSimStatus } from "@/lib/simulator/status";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";
import { RunAsSimulation } from "./run-as-simulation";
import { SetupSimulator } from "./setup-simulator";
import { SimConsole } from "./sim-console";

export const metadata = { title: copy.simulator.title };
export const dynamic = "force-dynamic";

const T = copy.simulator;

/**
 * The simulator's control panel (owner brief, 1 Oct 2026). On a real event it offers "Run as simulation" (a copy that is never public); on a simulation event (a copy,
 * or the Demo) it is the panel: speed, auto-play, who plays each seat, scenarios, View as…, the checklist and Reset.
 */
export default async function SimulatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await getDb();
  const { data: event } = await supabase.from("events").select("id, name, slug, is_simulation").eq("id", id).maybeSingle();
  if (!event) notFound();

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-3xl font-extrabold">{T.title}</h1>
      <p className="font-semibold">{T.intro}</p>
      <Link href={`/org/events/${id}/event`} className="w-fit underline">
        {T.backToEvent}
      </Link>
    </header>
  );

  if (!event.is_simulation) {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <RunAsSimulation eventId={id} eventName={event.name} />
      </main>
    );
  }

  const result = await loadSimStatus({ user: supabase, service: createServiceClient(), userId: user.id }, id);
  if (result.kind === "denied") notFound();
  if (result.kind === "needs_setup") {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <SetupSimulator eventId={id} />
      </main>
    );
  }
  if (result.kind !== "ok") {
    return (
      <main className="flex flex-col gap-6">
        {header}
        <Banner tone="danger">{result.kind === "error" ? result.message : T.generic}</Banner>
      </main>
    );
  }
  return (
    <main className="flex flex-col gap-6">
      {header}
      <SimConsole eventId={id} initial={result.status} />
    </main>
  );
}
