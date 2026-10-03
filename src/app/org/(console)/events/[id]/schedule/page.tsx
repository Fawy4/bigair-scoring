import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org/context";
import { buildHeatModel, type DivisionRowDb, type HeatRowDb, type RoundRowDb } from "@/lib/schedule/model";
import { eventDays, todayIn, type PlanRow } from "@/lib/schedule/plans";
import { parseEventBranding, parseEventSettings } from "@/lib/schemas/event-settings";
import { PartBoundary } from "@/components/part-boundary";
import { copy } from "@/lib/ui-copy";
import { ScheduleManager } from "./schedule-manager";

export const metadata = { title: copy.wizard.steps.schedule };
export const dynamic = "force-dynamic";

export default async function ScheduleStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ day?: string }> }) {
  const { id } = await params;
  const { day: askedDay } = await searchParams;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, timezone, start_date, end_date, settings, branding").eq("id", id).maybeSingle();
  if (!event) notFound();
  const [{ data: divisions }, { data: rounds }, { data: heats }, { data: plans }] = await Promise.all([
    supabase.from("divisions").select("id, name, sort_order, draw").eq("event_id", id).order("sort_order").order("created_at"),
    supabase.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", id),
    supabase.from("heats").select("id, division_id, round_id, draw_uid, number, name, status, started_at, ended_at, duration_sec, warm_up_sec, paused_total_sec").eq("event_id", id),
    supabase.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, hand_pins").eq("event_id", id).order("created_at"),
  ]);

  if ((heats ?? []).length === 0) {
    return (
      <main className="flex flex-col gap-4">
        <h1>{copy.runOrder.stepHeading}</h1>
        <p className="panel text-lg font-semibold">{copy.runOrder.noHeats}</p>
        <Link href={`/org/events/${id}/draw`} className="btn btn-primary w-fit">
          {copy.wizard.steps.draw}
        </Link>
      </main>
    );
  }

  const model = buildHeatModel((divisions ?? []) as DivisionRowDb[], (rounds ?? []) as RoundRowDb[], (heats ?? []) as HeatRowDb[]);
  const settings = parseEventSettings(event.settings);
  const branding = parseEventBranding(event.branding);
  const days = eventDays(event.start_date, event.end_date);
  const tz = event.timezone || "Africa/Cairo";
  const today = todayIn(tz, Date.now());
  return (
    <main className="flex flex-col gap-6">
      <h1>{copy.runOrder.stepHeading}</h1>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{copy.runOrder.intro}</p>
      <PartBoundary what={copy.crash.parts.runOrder}>
        <ScheduleManager
          eventId={id}
          eventName={event.name}
          timezone={tz}
          days={days.length ? days : [today]}
          today={today}
          initialDay={typeof askedDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(askedDay) ? askedDay : undefined}
          serverNow={new Date().toISOString()}
          logoUrl={branding.logoUrl ?? null}
          readyCallMin={settings.readyCallMin}
          infos={model.infos}
          lives={model.lives}
          plans={(plans ?? []) as PlanRow[]}
        />
      </PartBoundary>
    </main>
  );
}
