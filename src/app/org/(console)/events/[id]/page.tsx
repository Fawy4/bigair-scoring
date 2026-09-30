import Link from "next/link";
import { notFound } from "next/navigation";
import { computeTimetable } from "@/lib/engine/schedule";
import { getOrgContext } from "@/lib/org/context";
import { loadSetupCounts } from "@/lib/org/setup-counts";
import { requestOrigin } from "@/lib/platform/origin";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { rowToPlan, todayIn, type PlanRow } from "@/lib/schedule/plans";
import { copy } from "@/lib/ui-copy";
import { ShareCard } from "./share-card";

export const metadata = { title: copy.layout.dashboard };
export const dynamic = "force-dynamic";

const T = copy.dashboard;

/** The organiser's landing page for an event: today's timetable, the current and next heat, what is still missing, and the links to share. */
export default async function EventDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, slug, status, timezone, start_date, end_date, location").eq("id", id).maybeSingle();
  if (!event) notFound();
  const tz = event.timezone || "Africa/Cairo";
  const today = todayIn(tz, Date.now());
  const [{ data: divisions }, { data: rounds }, { data: heats }, { data: plans }, counts] = await Promise.all([
    supabase.from("divisions").select("id, name, sort_order, draw, scoring_model_id, format_template_id").eq("event_id", id).order("sort_order"),
    supabase.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", id),
    supabase.from("heats").select("id, division_id, round_id, draw_uid, number, name, status, started_at, ended_at, duration_sec, warm_up_sec, paused_total_sec").eq("event_id", id),
    supabase.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active").eq("event_id", id),
    loadSetupCounts(supabase, id),
  ]);

  const model = buildHeatModel((divisions ?? []) as DivisionRowDb[], (rounds ?? []) as RoundRowDb[], (heats ?? []) as HeatRowDb[]);
  const todays = ((plans ?? []) as PlanRow[]).find((p) => p.day === today && p.active);
  let rows: ReturnType<typeof computeTimetable>["rows"] = [];
  let finish: string | null = null;
  if (todays) {
    try {
      const { plan, defaults } = rowToPlan(todays);
      const t = computeTimetable(plan, model.lives, { timezone: tz, eventDay: today, defaults, now: new Date().toISOString() });
      rows = t.rows;
      finish = t.finish;
    } catch {
      rows = [];
    }
  }
  const live = rows.find((r) => r.status === "live");
  const next = rows.find((r) => r.status === "next");

  const missing: string[] = [];
  const divs = divisions ?? [];
  for (const d of divs) {
    if ((counts.ridersByDivision[d.id] ?? 0) === 0) missing.push(T.noRiders(d.name));
  }
  if (counts.judgeSeats === 0) missing.push(T.noJudgeSeats);
  missing.push(...counts.panelShortfalls);
  for (const d of divs) {
    if ((counts.ridersByDivision[d.id] ?? 0) === 0) continue;
    if (!(counts.drawn ?? []).includes(d.id)) missing.push(T.drawMissing(d.name));
    else if (!(counts.locked ?? []).includes(d.id)) missing.push(T.drawNotLocked(d.name));
  }
  if (!counts.activePlan) missing.push(T.noActivePlan);

  const origin = await requestOrigin();

  return (
    <main className="flex flex-col gap-6" data-testid="dashboard">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-extrabold">{T.heading(event.name)}</h1>
        <span className="font-semibold">{[event.location, event.start_date].filter(Boolean).join(" · ")}</span>
      </div>

      <section className="panel flex flex-col gap-3" aria-label={T.missingHeading} data-testid="dashboard-missing">
        <h2 className="text-xl font-extrabold">{T.missingHeading}</h2>
        {missing.length === 0 ? (
          <p className="font-bold" data-testid="dashboard-ready">{T.allReady}</p>
        ) : (
          <ul className="list-disc pl-6 font-semibold">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel flex flex-col gap-3" aria-label={T.today} data-testid="dashboard-today">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-extrabold">{T.today}</h2>
          {finish ? <span className="font-bold">{copy.runOrder.finish(finish)}</span> : null}
          <Link href={`/org/events/${id}/schedule`} className="btn">
            {T.openRunOrder}
          </Link>
        </div>
        <p className="font-bold" data-testid="dashboard-now">
          {T.current}: {live ? `${live.division} · ${live.round} · ${live.heat} (${live.start}–${live.end})` : T.nothingRunning}
        </p>
        <p className="font-bold" data-testid="dashboard-next">
          {T.next}: {next ? `${next.division} · ${next.round} · ${next.heat} (${next.warmUpMin > 0 ? `${copy.runOrder.warmUpAt(next.warmUpStart ?? "")}, ` : ""}${next.start})` : T.nothingNext}
        </p>
        {!todays ? (
          <p className="font-semibold">{T.noPlan}</p>
        ) : (
          <table className="w-full border-collapse" data-testid="dashboard-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId} className="border-b-2 border-[#111]">
                  <td className="py-1 pr-3 font-extrabold">{r.start ?? "–"}</td>
                  <td className="py-1 pr-3 font-semibold">{r.kind === "heat" ? `${r.division} · ${r.round} · ${r.heat}` : r.label}</td>
                  <td className="py-1 text-sm font-bold">{copy.runOrder.status[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label={T.shareHeading}>
        <h2 className="text-xl font-extrabold">{T.shareHeading}</h2>
        <ShareCard testId="share-join" title={T.joinTitle} text={T.joinText} url={`${origin}/e/${event.slug}/join`} />
        <ShareCard testId="share-public" title={T.publicTitle} text={T.publicText} url={`${origin}/e/${event.slug}`} />
      </section>
    </main>
  );
}
