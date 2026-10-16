// The real Gateway: every WRITE is a call to the same server action the organiser's setup steps call (signed in as a member of the organisation);
// the READS are plain selects as that organiser. Nothing here inserts a row by hand.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Gateway } from "../../src/lib/event-setup/setup";
import type { Session } from "./harness";

const ev = "src/app/org/(console)/events";
const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error || r.data === null) throw new Error(`${what}: ${r.error?.message ?? "nothing came back"}`);
  return r.data;
};

export async function makeGateway(session: Session, service: SupabaseClient): Promise<Gateway> {
  const db = session.client;
  const root = `${process.cwd()}/${ev}`;
  const [events, divisions, riders, draws, officials, schedule] = await Promise.all([
    import(`${root}/actions`),
    import(`${root}/[id]/divisions/actions`),
    import(`${root}/[id]/riders/actions`),
    import(`${root}/[id]/draw/actions`),
    import(`${root}/[id]/officials/actions`),
    import(`${root}/[id]/schedule/actions`),
  ]);
  const { planOfRow } = await import("../../src/lib/schedule/plans");
  const { addHeatsToPlan } = await import("../../src/lib/engine/schedule");
  const ok = <T extends { ok: boolean }>(r: T, what: string): Extract<T, { ok: true }> => {
    if (!r.ok) throw new Error(`${what}: ${(r as unknown as { error?: string; message?: string }).error ?? (r as unknown as { message?: string }).message ?? "refused"}`);
    return r as Extract<T, { ok: true }>;
  };

  return {
    organisations: async () => must(await service.from("organisations").select("id, name, slug").is("archived_at", null), "organisations"),
    findEvent: async (orgId, slug) => (await db.from("events").select("id").eq("organisation_id", orgId).eq("slug", slug).maybeSingle()).data,
    createEvent: async (_orgId, form) => {
      const r = ok(await events.saveEvent(null, form, "draft"), "Creating the event");
      return { id: r.id as string };
    },
    divisions: async (eventId) => {
      const rows = must(await db.from("divisions").select("id, name, scoring_model_id, scoring_overrides, format_template_id, draw, draw_locked_at").eq("event_id", eventId).order("sort_order"), "divisions");
      return rows.map((d) => ({ id: d.id, name: d.name, scoringModelId: d.scoring_model_id, scoringOverrides: d.scoring_overrides, formatTemplateId: d.format_template_id, drawn: d.draw !== null, locked: d.draw_locked_at !== null }));
    },
    addDivision: async (eventId, name) => ({ id: ok(await divisions.addDivision(eventId, name), "Adding the division").id as string }),
    scoringModelId: async (key) => {
      const rows = must(await db.from("scoring_models").select("id, version, published_at").is("organisation_id", null).is("retired_at", null).eq("key", key).order("version", { ascending: false }), "scoring preset");
      const row = rows.find((r) => r.published_at);
      if (!row) throw new Error(`The scoring preset “${key}” is not published.`);
      return row.id;
    },
    formatPresetId: async (orgId, name) => (await db.from("format_templates").select("id").eq("organisation_id", orgId).eq("name", name).is("retired_at", null).limit(1)).data?.[0]?.id ?? null,
    saveFormatPreset: async (orgId, name, json) => ok(await divisions.savePreset({ kind: "format_template", organisationId: orgId, name, json }), "Saving the ladder").row.id as string,
    setDivisionScoring: async (divisionId, presetId, overrides) => void ok(await divisions.saveDivisionRules({ divisionId, kind: "scoring_model", presetId, overrides }), "Saving the scoring"),
    setDivisionFormat: async (divisionId, presetId) => void ok(await divisions.saveDivisionRules({ divisionId, kind: "format_template", presetId, overrides: {} }), "Applying the ladder"),
    entries: async (divisionId) => {
      const rows = must(await db.from("entries").select("id, rider_id, seed, riders(first_name, last_name)").eq("division_id", divisionId).order("seed"), "riders");
      return rows.map((e) => {
        const r = (e.riders as unknown as { first_name?: string; last_name?: string } | null) ?? {};
        return { entryId: e.id, riderId: e.rider_id, seed: e.seed, first: r.first_name ?? "", last: r.last_name ?? "" };
      });
    },
    addRider: async (divisionId, first, last) => void ok(await riders.addRider(divisionId, { first, last }), `Adding ${first} ${last}`),
    renameRider: async (riderId, first, last) => void ok(await riders.saveRider(riderId, { first, last }), "Renaming a rider"),
    generateDraw: async (divisionId) => void ok(await draws.generateDraw(divisionId, false), "Generating the draw"),
    lockDraw: async (divisionId) => void ok(await draws.lockDraw(divisionId), "Locking the draw"),
    seats: async (eventId) => must(await db.from("judge_seats").select("id, name, role").eq("event_id", eventId), "officials"),
    addSeat: async (eventId, name, role) => ({ id: ok(await officials.addSeat({ eventId, name, role, headAlsoScores: false }), `Adding the ${role} seat`).issued.seatId as string }),
    panel: async (divisionId) => {
      const d = (await db.from("divisions").select("panel_id").eq("id", divisionId).maybeSingle()).data;
      if (!d?.panel_id) return [];
      return must(await db.from("panel_members").select("judge_seat_id").eq("panel_id", d.panel_id), "panel members").map((m) => m.judge_seat_id);
    },
    setPanel: async (divisionId, ids) => void ok(await officials.savePanel(divisionId, ids), "Saving the panel"),
    heats: async (eventId) => must(await db.from("heats").select("id, number").eq("event_id", eventId).order("number"), "heats"),
    runOrder: async (eventId, day, name) => {
      const row = (await db.from("schedule_plans").select("id, items").eq("event_id", eventId).eq("day", day).eq("name", name).maybeSingle()).data;
      return row ? { id: row.id, heats: ((row.items as Array<{ kind: string }>) ?? []).filter((i) => i.kind === "heat").length } : null;
    },
    createRunOrder: async (eventId, day, name) => ({ id: ok(await schedule.createPlan(eventId, day, name), "Creating the run order").row.id as string }),
    fillRunOrder: async (planId, heatIds, breaks) => {
      const row = must(await db.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, hand_pins").eq("id", planId).maybeSingle(), "run order");
      const plan = addHeatsToPlan(planOfRow(row as never), heatIds);
      ok(await schedule.savePlan(planId, { items: plan.items, anchors: plan.anchors, defaults: { breakAfterHeatMin: breaks.afterHeatMin, breakAfterRoundMin: breaks.afterRoundMin } }), "Saving the run order");
    },
  };
}
