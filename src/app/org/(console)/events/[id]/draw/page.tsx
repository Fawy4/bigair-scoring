import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDivisionContext } from "@/lib/draw/server";
import { getOrgContext } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";
import { DrawManager, type DivisionSummary } from "./draw-manager";

export const metadata = { title: copy.wizard.steps.draw };
export const dynamic = "force-dynamic";

export default async function DrawStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
  const { id } = await params;
  const { division } = await searchParams;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) notFound();
  const { data: divisions } = await supabase.from("divisions").select("id, name, draw_locked_at, format_template_id").eq("event_id", id).order("sort_order").order("created_at");

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
  const [{ data: entries }, { data: heats }] = await Promise.all([
    supabase.from("entries").select("division_id, status").eq("event_id", id),
    supabase.from("heats").select("division_id, status, started_at").eq("event_id", id),
  ]);
  const summaries: DivisionSummary[] = divisions.map((d) => ({
    id: d.id,
    name: d.name,
    riders: (entries ?? []).filter((e) => e.division_id === d.id && e.status === "confirmed").length,
    hasDraw: (heats ?? []).some((h) => h.division_id === d.id),
    locked: Boolean(d.draw_locked_at),
    started: (heats ?? []).some((h) => h.division_id === d.id && (h.status !== "scheduled" || h.started_at)),
  }));

  const ctx = await loadDivisionContext(supabase, current.id);
  const { data: format } = current.format_template_id ? await supabase.from("format_templates").select("name").eq("id", current.format_template_id).maybeSingle() : { data: null };

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
