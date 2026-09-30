import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org/context";
import { loadPanelOverview } from "@/lib/org/panel-overview";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";
import { OfficialsManager } from "./officials-manager";
import type { RiderChoice, SeatRow } from "./seat-card";

export const metadata = { title: copy.wizard.steps.officials };
export const dynamic = "force-dynamic";

export default async function OfficialsStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) notFound();

  const [{ data: seats }, { data: contacts }, overview, { data: entries }, { data: divisions }] = await Promise.all([
    supabase.from("judge_seats").select("id, name, role, status, active, scores, spotter_assignment, auth_user_id, last_seen_at, created_at").eq("event_id", id).order("created_at"),
    supabase.rpc("get_seat_contacts", { p_event: id }),
    loadPanelOverview(supabase, id),
    supabase.from("entries").select("id, division_id, seed, riders(first_name, last_name)").eq("event_id", id).eq("status", "confirmed").order("seed", { nullsFirst: false }),
    supabase.from("divisions").select("id, name").eq("event_id", id).order("sort_order").order("created_at"),
  ]);

  // which seats already have a PIN on file (the PIN itself never leaves the server)
  const { data: withPin } = await createServiceClient().from("judge_seats").select("id").eq("event_id", id).not("pin_enc", "is", null);
  const pinIds = new Set((withPin ?? []).map((s) => s.id));
  const phones = new Map((contacts ?? []).map((c) => [c.seat_id, c.phone]));

  const rows: SeatRow[] = (seats ?? []).map((s) => {
    const assigned = s.spotter_assignment && typeof s.spotter_assignment === "object" && Array.isArray((s.spotter_assignment as { entries?: unknown }).entries) ? ((s.spotter_assignment as { entries: string[] }).entries) : null;
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      status: s.status as "active" | "pending",
      active: s.active,
      scores: s.scores,
      bound: Boolean(s.auth_user_id),
      lastSeenAt: s.last_seen_at,
      hasPin: pinIds.has(s.id),
      phone: phones.get(s.id) ?? null,
      spotterEntries: assigned,
    };
  });
  const riders: RiderChoice[] = (divisions ?? []).map((d) => ({
    divisionId: d.id,
    divisionName: d.name,
    riders: (entries ?? []).filter((e) => e.division_id === d.id).map((e) => ({ entryId: e.id, name: `${e.riders?.first_name ?? ""} ${e.riders?.last_name ?? ""}`.trim() })),
  }));

  return (
    <main className="flex max-w-5xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">{copy.officials.stepHeading}</h1>
      <p className="font-semibold">{copy.officials.intro}</p>
      <OfficialsManager
        eventId={id}
        eventName={event.name}
        seats={rows}
        panels={overview.map((o) => ({ id: o.id, name: o.name, minJudges: o.minJudges, hasScoringModel: o.hasScoringModel, seatIds: o.seatIds }))}
        riders={riders}
      />
    </main>
  );
}
