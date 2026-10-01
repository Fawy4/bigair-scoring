import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { computeTimetable, timetableExportRows } from "@/lib/engine/schedule";
import { getOrgContext } from "@/lib/org/context";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { rowToPlan, todayIn, type PlanRow } from "@/lib/schedule/plans";
import { parseEventBranding } from "@/lib/schemas/event-settings";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.runOrder.exportPdf };
export const dynamic = "force-dynamic";

/** The timetable on paper (Print → Save as PDF): Division / Session / Start / Duration / End / Break, with the event logo. */
export default async function SchedulePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plan?: string }> }) {
  const { id } = await params;
  const { plan: planId } = await searchParams;
  if (!planId || !/^[0-9a-f-]{36}$/.test(planId)) notFound();
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, timezone, branding, settings").eq("id", id).maybeSingle();
  const { data: row } = await supabase.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active").eq("id", planId).eq("event_id", id).maybeSingle();
  if (!event || !row) notFound();
  const [{ data: divisions }, { data: rounds }, { data: heats }] = await Promise.all([
    supabase.from("divisions").select("id, name, sort_order, draw").eq("event_id", id).order("sort_order"),
    supabase.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", id),
    supabase.from("heats").select("id, division_id, round_id, draw_uid, number, name, status, started_at, ended_at, duration_sec, warm_up_sec, paused_total_sec").eq("event_id", id),
  ]);
  const model = buildHeatModel((divisions ?? []) as DivisionRowDb[], (rounds ?? []) as RoundRowDb[], (heats ?? []) as HeatRowDb[]);
  const { plan, defaults } = rowToPlan(row as PlanRow, parseEventSettings(event.settings).readyCallMin);
  const tz = event.timezone || "Africa/Cairo";
  const now = todayIn(tz, Date.now()) === row.day ? new Date().toISOString() : undefined;
  const table = computeTimetable(plan, model.lives, { timezone: tz, eventDay: row.day, defaults, ...(now ? { now } : {}) });
  const { rows, showWarmUp } = timetableExportRows(table);
  const logo = parseEventBranding(event.branding).logoUrl;
  const T = copy.runOrder.export;
  return (
    <main className="flex flex-col gap-4 p-2" data-testid="schedule-print">
      <div className="no-print flex items-center gap-3">
        <PrintButton label={copy.draw.printNow} />
        <span className="font-semibold">{copy.draw.printHelp}</span>
      </div>
      <header className="flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the event's own logo on paper
          <img src={logo} alt="" className="h-14 w-auto" />
        ) : null}
        <div>
          <h1 className="text-3xl font-extrabold">{event.name}</h1>
          <p className="font-semibold">
            {copy.runOrder.dayLabel(row.day)} · {plan.name}
            {table.finish ? ` · ${T.finish(table.finish)}` : ""}
          </p>
        </div>
      </header>
      <table className="w-full border-collapse text-lg" data-testid="schedule-print-table">
        <thead>
          <tr className="bg-[#111] text-white">
            <th className="p-2 text-left">{T.division}</th>
            <th className="p-2 text-left">{T.session}</th>
            {showWarmUp ? <th className="p-2">{T.warmUp}</th> : null}
            <th className="p-2">{T.start}</th>
            <th className="p-2">{T.duration}</th>
            <th className="p-2">{T.end}</th>
            <th className="p-2">{T.break}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b-2 border-[#111] ${r.kind === "heat" ? "" : "bg-[#fde68a]"}`}>
              <td className="p-2 font-bold">{r.division}</td>
              <td className="p-2 font-semibold">{r.session}</td>
              {showWarmUp ? <td className="p-2 text-center">{r.warmUp}</td> : null}
              <td className="p-2 text-center font-extrabold">{r.start}</td>
              <td className="p-2 text-center">{r.duration}</td>
              <td className="p-2 text-center">{r.end}</td>
              <td className="p-2 text-center">{r.break}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-semibold italic">{T.estimates}</p>
    </main>
  );
}
