import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTEXT_ENTRY_COLUMNS, CONTEXT_HEAT_COLUMNS, DIVISION_CONTEXT_COLUMNS, divisionContextFrom, type ContextDivisionRow, type ContextEntryRow, type DivisionContext } from "@/lib/draw/server";
import { getDb } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";
import { DrawManager, type DivisionSummary } from "./draw-manager";

export const metadata = { title: copy.wizard.steps.draw };
export const dynamic = "force-dynamic";

export default async function DrawStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
  const { id } = await params;
  const { division } = await searchParams;
  const { supabase } = await getDb();
  // one round: the event, the divisions (the one shown comes with everything the draw is worked out from), every division's riders and heats
  const wanted = division && /^[0-9a-f-]{36}$/.test(division) ? division : null;
  const full = () => supabase.from("divisions").select(DIVISION_CONTEXT_COLUMNS).eq("event_id", id);
  const [{ data: event }, { data: divisions }, { data: pickedRows }, { data: firstRows }, { data: entries }, { data: heats }] = await Promise.all([
    supabase.from("events").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("divisions").select("id, name, draw_locked_at, format_template_id").eq("event_id", id).order("sort_order").order("created_at"),
    wanted ? full().eq("id", wanted).limit(1) : Promise.resolve({ data: [] }),
    full().order("sort_order").order("created_at").limit(1),
    supabase.from("entries").select(CONTEXT_ENTRY_COLUMNS).eq("event_id", id),
    supabase.from("heats").select(CONTEXT_HEAT_COLUMNS).eq("event_id", id).order("number"),
  ]);
  if (!event) notFound();

  if (!divisions?.length) {
    return (
      <main className="flex flex-col gap-4">
        <h1>{copy.draw.stepHeading}</h1>
        <p className="panel text-lg font-semibold">{copy.draw.noDivisions}</p>
        <Link href={`/org/events/${id}/divisions`} className="btn btn-primary w-fit">
          {copy.wizard.steps.divisions}
        </Link>
      </main>
    );
  }
  const current = divisions.find((d) => d.id === division) ?? divisions[0];
  const currentRow = ([...(pickedRows ?? []), ...(firstRows ?? [])] as unknown as ContextDivisionRow[]).find((d) => d.id === current.id);
  if (!currentRow) notFound();
  const summaries: DivisionSummary[] = divisions.map((d) => ({
    id: d.id,
    name: d.name,
    riders: (entries ?? []).filter((e) => e.division_id === d.id && e.status === "confirmed").length,
    hasDraw: (heats ?? []).some((h) => h.division_id === d.id),
    locked: Boolean(d.draw_locked_at),
    started: (heats ?? []).some((h) => h.division_id === d.id && (h.status !== "scheduled" || h.started_at)),
  }));

  const ctx = divisionContextFrom(
    currentRow,
    ((entries ?? []) as unknown as Array<ContextEntryRow & { division_id: string }>).filter((e) => e.division_id === current.id),
    ((heats ?? []) as unknown as Array<DivisionContext["heatRows"][number] & { division_id: string }>).filter((h) => h.division_id === current.id),
  );
  const format = currentRow.format_templates;

  return (
    <main className="flex flex-col gap-6">
      <h1>{copy.draw.stepHeading}</h1>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{copy.draw.intro}</p>
      <DrawManager
        key={current.id}
        eventId={id}
        divisions={summaries}
        selected={{
          id: ctx.id,
          name: ctx.name,
          locked: ctx.locked,
          started: ctx.started,
          draw: ctx.draw,
          scheme: ctx.scheme,
          riders: summaries.find((s) => s.id === current.id)!.riders,
          formatName: ctx.template ? (ctx.template.name ?? format?.name ?? null) : null,
          formatProblem: ctx.templateError,
        }}
      />
    </main>
  );
}
