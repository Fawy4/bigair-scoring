import { notFound } from "next/navigation";
import { ClockText } from "@/components/clock-text";
import { DriftBadge } from "@/components/drift-badge";
import { scheduleDrift, type Drift } from "@/lib/schedule/drift";
import { computeTimetable } from "@/lib/engine/schedule";
import { getDb } from "@/lib/org/context";
import { readiness } from "@/lib/org/readiness";
import { loadSetupRows, setupCountsFrom } from "@/lib/org/setup-counts";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { requestOrigin } from "@/lib/platform/origin";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { rowToPlan, todayIn, type PlanRow } from "@/lib/schedule/plans";
import { copy } from "@/lib/ui-copy";
import { DashboardView, type DashboardRow } from "./dashboard-view";
import { ExportCard } from "./export-card";

export const metadata = { title: copy.layout.dashboard };
export const dynamic = "force-dynamic";

/** Go live: the start of event day. What is still missing, what is running now and next, Hold and Shift, the head judge console, the links to share. */
export default async function EventDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getDb();
  // one round: the event and everything the page is worked out from (the time zone is only needed afterwards, for "today")
  const [{ data: event }, { data: divisions }, { data: rounds }, { data: heats }, { data: plans }, setupRows] = await Promise.all([
    supabase.from("events").select("id, name, slug, status, timezone, start_date, end_date, location, settings, is_simulation").eq("id", id).maybeSingle(),
    supabase.from("divisions").select("id, name, sort_order, draw, scoring_model_id, format_template_id").eq("event_id", id).order("sort_order"),
    supabase.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", id),
    supabase.from("heats").select("id, division_id, round_id, draw_uid, number, name, status, started_at, paused_at, ended_at, duration_sec, warm_up_sec, paused_total_sec").eq("event_id", id),
    supabase.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active").eq("event_id", id),
    loadSetupRows(supabase, id),
  ]);
  if (!event) notFound();
  const tz = event.timezone || "Africa/Cairo";
  const today = todayIn(tz, Date.now());
  const counts = setupCountsFrom(setupRows, tz);

  const model = buildHeatModel((divisions ?? []) as DivisionRowDb[], (rounds ?? []) as RoundRowDb[], (heats ?? []) as HeatRowDb[]);
  const todays = ((plans ?? []) as PlanRow[]).find((p) => p.day === today && p.active);
  let table: ReturnType<typeof computeTimetable> | null = null;
  if (todays) {
    try {
      const { plan, defaults } = rowToPlan(todays, parseEventSettings(event.settings).readyCallMin);
      table = computeTimetable(plan, model.lives, { timezone: tz, eventDay: today, defaults, now: new Date().toISOString() });
    } catch {
      table = null;
    }
  }
  const rows = table?.rows ?? [];
  const live = rows.find((r) => r.status === "live");
  const waiting = (r: (typeof rows)[number]) => r.kind === "heat" && r.status !== "done" && r.status !== "live" && r.status !== "cancelled";
  const heatLabel = (r: (typeof rows)[number]) => `${r.division} · ${r.round} · ${r.heat}`;
  const next = rows.find((r) => r.status === "next") ?? rows.find(waiting) ?? null;
  const after = next ? (rows.slice(rows.indexOf(next) + 1).find(waiting) ?? null) : null;

  const runningRow = (heats ?? []).find((h) => h.status === "running" || h.status === "paused");
  const runningTimetableRow = runningRow ? rows.find((r) => r.heatId === runningRow.id) : undefined;
  const runningLabel = live ? heatLabel(live) : runningTimetableRow ? heatLabel(runningTimetableRow) : runningRow ? (runningRow.name ?? `Heat ${runningRow.number}`) : null;

  const origin = await requestOrigin();
  const ready = readiness({ eventId: id, divisions: divisions ?? [], counts });
  const dashRows: DashboardRow[] = rows.map((r) => ({ id: r.itemId, start: r.start, label: r.kind === "heat" ? heatLabel(r) : r.label, status: r.status }));
  // how far the day has slipped: the next heat that has not started, in the plan as written against now
  let drift: Drift | null = null;
  if (todays) {
    try {
      const { plan, defaults } = rowToPlan(todays, parseEventSettings(event.settings).readyCallMin);
      drift = scheduleDrift(plan, model.lives, { timezone: tz, eventDay: today, defaults, now: new Date().toISOString() });
    } catch {
      drift = null;
    }
  }
  const holdSince = todays?.hold && typeof todays.hold === "object" && "since" in todays.hold ? String((todays.hold as { since: string }).since) : null;

  return (
    <div data-testid="dashboard" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[20px] font-semibold leading-tight">{copy.dashboard.heading(event.name)}</h1>
        <DriftBadge drift={drift} />
        <ClockText timezone={tz} serverNow={new Date().toISOString()} />
      </div>
      <DashboardView
        eventId={id}
        timezone={tz}
        checks={ready.checks.map((c) => ({ id: c.id, state: c.state, sentence: c.sentence, fixHref: c.fixHref }))}
        plan={todays ? { id: todays.id, heldSince: holdSince ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.parse(holdSince)) : null } : null}
        rows={dashRows}
        finish={table?.finish ?? null}
        running={runningRow && runningLabel ? { label: runningLabel, timing: { status: runningRow.status, durationSec: runningRow.duration_sec, startedAt: runningRow.started_at, pausedAt: runningRow.paused_at, pausedTotalSec: runningRow.paused_total_sec } } : null}
        next={next ? { label: heatLabel(next), start: next.start } : null}
        after={after ? { label: heatLabel(after), start: after.start } : null}
        joinUrl={`${origin}/e/${event.slug}/join`}
        publicUrl={`${origin}/e/${event.slug}`}
        slug={event.slug}
        flagsOn={parseEventSettings(event.settings).flags.enabled}
        windBannerOn={parseEventSettings(event.settings).windCallBanner}
      />
      <ExportCard eventId={id} isSimulation={Boolean(event.is_simulation)} />
    </div>
  );
}
