import type { SupabaseClient } from "@supabase/supabase-js";
import { applyHeatStatuses } from "@/lib/draw/entrants";
import { walkoverPlan } from "@/lib/draw/walkover";
import { heatCanWalkover, walkoverRanking, type DivisionDraw } from "@/lib/engine/ladder";
import { heatResetPlan } from "@/lib/reset/plan";
import { reasonOf } from "@/lib/reason";
import { parseDivisionLive } from "@/lib/schemas/division-live";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { signedInUser } from "@/lib/supabase/claims";
import { copy } from "@/lib/ui-copy";
import { errorSentence, parseError } from "./errors";
import { ladderStep } from "./ladder-step";
import type { PublishInputs } from "./publish-core";
import type { SlotRow } from "./types";
import { didNotStartBreakdown, heatShortTitle, isWalkoverHeat, meaningfulReason, walkoverBreakdown, walkoverSentence } from "./walkover";
import { effectiveSetting, holdAtPublish } from "./visibility";

export type WalkoverOutcome = { ok: true; already: boolean; winner: string | null } | { ok: false; code: string | null; message: string };
export type SimpleOutcome = { ok: true } | { ok: false; code: string | null; message: string };

const fail = (code: string | null, message?: string): { ok: false; code: string | null; message: string } => ({ ok: false, code, message: message ?? errorSentence(code) });
const fromDb = (error: { message: string }) => ({ ok: false as const, code: parseError(error.message).code, message: errorSentence(error.message) });

/** The name a rider has in the audit log: "Adam Arrow". */
const fullName = (e: { first_name: string | null; last_name: string | null } | undefined) => `${e?.first_name ?? ""} ${e?.last_name ?? ""}`.trim() || copy.headLive.riderFallback;

/** The reason typed when each rider was marked, newest first (Didn't show · Injured …), read from the audit log the head judge can read. */
async function reasonsOf(user: SupabaseClient, eventId: string, heatId: string): Promise<Map<string, string | null>> {
  const { data } = await user
    .from("audit_log")
    .select("action, reason, at, after")
    .eq("event_id", eventId)
    .in("action", ["rider_status_set", "rider_out_of_event"])
    .or(`after->>heat_id.eq.${heatId}`)
    .order("at", { ascending: false })
    .limit(200);
  const out = new Map<string, string | null>();
  for (const r of data ?? []) {
    const after = (r.after ?? {}) as { entry_id?: string; modifier?: string | null };
    if (!after.entry_id || out.has(after.entry_id)) continue;
    // the newest line decides: a rider put "Back in the heat" has no reason any more
    out.set(after.entry_id, r.action === "rider_status_set" && after.modifier == null ? null : meaningfulReason(r.reason));
  }
  return out;
}

async function roleOf(user: SupabaseClient, eventId: string): Promise<"head" | "organiser"> {
  const { data } = await user.rpc("am_i_head", { p_event: eventId });
  return data === true ? "head" : "organiser";
}

/**
 * The walkover (Console – Walkover): a heat that has not started and has only one rider who can ride is finished and published at once, nobody rides, nothing is scored.
 * The caller's rights are checked by the database when the inputs are read (head judge or organiser); the places and the next seats come from the same ladder step a normal
 * Publish uses; everything is written by `walkover_heat_commit` in one transaction. Pressing the button twice gives one walkover. With nobody left, nobody goes through.
 */
export async function walkoverHeatCore(db: { user: SupabaseClient; service: SupabaseClient }, heatId: string): Promise<WalkoverOutcome> {
  const { user, service } = db;
  const { data: got, error: readError } = await user.rpc("publish_heat_inputs", { p_heat: heatId });
  if (readError || !got) return fromDb(readError ?? { message: "HEAT_NOT_FOUND" });
  const me = await signedInUser(user);
  if (!me) return fail("NOT_ALLOWED");
  const read = got as unknown as PublishInputs;
  const { heat, latest, division, entries } = read;
  const slots = read.slots as SlotRow[];
  const draw = (division.draw ?? null) as DivisionDraw | null;

  if (heat.status === "published") {
    const { data: times } = await user.from("heats").select("status, started_at, ended_at").eq("id", heatId).maybeSingle();
    return times && isWalkoverHeat(times) ? { ok: true, already: true, winner: null } : fail("HEAT_PUBLISHED");
  }
  if (heat.status === "cancelled") return fail("HEAT_CANCELLED");
  if (heat.status !== "scheduled") return fail("WALKOVER_NOT_POSSIBLE");

  const state = heatCanWalkover(slots.map((s) => ({ entrantId: s.entry_id, modifier: s.modifier })));
  if (state.kind !== "walkover" && state.kind !== "nobody") return fail("WALKOVER_NOT_POSSIBLE");
  const ranking = walkoverRanking(slots.map((s) => ({ entrantId: s.entry_id, modifier: s.modifier })));

  const step = ladderStep(draw, heat.draw_uid, read.division_heats, ranking);
  if (!step.ok) return fail(step.code, step.message);

  const names = new Map(entries.map((e) => [e.id, fullName(e)] as const));
  const outOf = (id: string) => Boolean(draw?.entrants.find((x) => x.id === id)?.withdrawn);
  const placeOf = new Map(ranking.ranked.map((r) => [r.entrantId, r.place] as const));
  const results = slots
    .filter((s) => s.entry_id)
    .map((s) => ({
      entry_id: s.entry_id as string,
      place: placeOf.get(s.entry_id as string) ?? null,
      breakdown: state.kind === "walkover" && s.entry_id === state.winner ? walkoverBreakdown() : didNotStartBreakdown(outOf(s.entry_id as string)),
    }));

  // the audit sentence, in words
  const [{ data: round }, reasons, who] = await Promise.all([user.from("rounds").select("short_name, name").eq("id", heat.round_id).maybeSingle(), reasonsOf(user, heat.event_id, heatId), roleOf(user, heat.event_id)]);
  const others = state.others.map((id) => ({ name: names.get(id) ?? copy.headLive.riderFallback, outOfEvent: outOf(id), reason: reasons.get(id) ?? null }));
  const words = walkoverSentence({ who, heat: heatShortTitle(round?.short_name ?? round?.name ?? "", heat.number), winner: state.kind === "walkover" ? (names.get(state.winner) ?? copy.headLive.riderFallback) : null, others });

  const settings = parseEventSettings(read.event_settings);
  const dl = parseDivisionLive(division.live_settings);
  const hold = holdAtPublish({
    holdFinalResult: effectiveSetting(dl.holdFinalResult, settings.holdFinalResult),
    publicResultsOnPublish: effectiveSetting(dl.publicResultsOnPublish, settings.publicResultsOnPublish),
    roundIsLast: step.roundIsLast,
  });

  const { data, error } = await service.rpc("walkover_heat_commit", {
    p_heat: heatId,
    p_results: results as never,
    p_draw: (step.draw ?? null) as never,
    p_projection: step.projection as never,
    p_hold: hold,
    p_words: words,
    p_actor: me.id,
  });
  if (error) return fromDb(error);
  void latest;
  return { ok: true, already: Boolean((data as { already?: boolean } | null)?.already), winner: state.kind === "walkover" ? state.winner : null };
}

/**
 * Out of the event (injured or withdrew): the same thing "Withdrawn" on the Riders step does, from the head judge's console. The draw comes from the engine
 * (`walkoverPlan`, shared with the Riders step) so every later seat of the rider is a walkover, second-chance heats included, and a rider left alone moves on as the
 * format says; the database writes the entry, the seats and the draw in one transaction and checks the rights (head judge seat or organiser).
 */
export async function outOfEventCore(user: SupabaseClient, input: { heatId: string; entryId: string; reason: string }): Promise<SimpleOutcome> {
  const reason = reasonOf(input.reason);
  const { data: heat } = await user.from("heats").select("id, event_id, division_id, round_id, number, status").eq("id", input.heatId).maybeSingle();
  if (!heat) return fail("HEAT_NOT_FOUND");
  const [{ data: division }, { data: siblings }, { data: entry }, { data: round }] = await Promise.all([
    user.from("divisions").select("draw, draw_locked_at").eq("id", heat.division_id).maybeSingle(),
    user.from("heats").select("draw_uid, status, started_at").eq("division_id", heat.division_id),
    user.from("v_entries").select("first_name, last_name").eq("id", input.entryId).maybeSingle(),
    user.from("rounds").select("short_name, name").eq("id", heat.round_id).maybeSingle(),
  ]);
  const draw = (division?.draw ?? null) as DivisionDraw | null;
  let p_draw: DivisionDraw | null = null;
  let p_projection: unknown[] = [];
  if (draw && division?.draw_locked_at && draw.entrants.some((x) => x.id === input.entryId && !x.withdrawn)) {
    const plan = walkoverPlan(draw, siblings ?? [], input.entryId);
    p_draw = plan.draw;
    p_projection = plan.seats;
  }
  const who = await roleOf(user, heat.event_id);
  const words = copy.walkover.audit.outLine(copy.walkover.audit.who[who], heatShortTitle(round?.short_name ?? round?.name ?? "", heat.number), fullName(entry ?? undefined), meaningfulReason(reason));
  const { error } = await user.rpc("head_out_of_event", { p_heat: input.heatId, p_entry: input.entryId, p_reason: reason, p_words: words, p_draw: p_draw as never, p_projection: p_projection as never });
  return error ? fromDb(error) : { ok: true };
}

/**
 * Re-open on a walkover heat: back to Not started with its riders, the seats it filled go back to their places in the draw. Refused once a heat it fed has started
 * (the same check Reset uses). Returns null when the heat is not a walkover, so the caller does today's Re-open.
 */
export async function reopenWalkoverCore(user: SupabaseClient, heatId: string, reason: string): Promise<SimpleOutcome | null> {
  const { data: heat } = await user.from("heats").select("id, event_id, division_id, round_id, number, status, started_at, ended_at, draw_uid").eq("id", heatId).maybeSingle();
  if (!heat) return fail("HEAT_NOT_FOUND");
  if (!isWalkoverHeat(heat)) return null;
  const [{ data: division }, { data: siblings }, { data: round }] = await Promise.all([
    user.from("divisions").select("draw").eq("id", heat.division_id).maybeSingle(),
    user.from("heats").select("draw_uid, status, started_at").eq("division_id", heat.division_id),
    user.from("rounds").select("short_name, name").eq("id", heat.round_id).maybeSingle(),
  ]);
  const draw = (division?.draw ?? null) as DivisionDraw | null;
  let p_draw: DivisionDraw | null = null;
  let p_seats: unknown[] = [];
  if (draw && heat.draw_uid) {
    const drawHeat = draw.rounds.flatMap((r) => r.heats).find((h) => (h.uid ?? h.id) === heat.draw_uid);
    if (drawHeat && draw.results?.[drawHeat.id]) {
      const plan = heatResetPlan(applyHeatStatuses(draw, siblings ?? []), heat.draw_uid);
      if (!plan.ok) return { ok: false, code: "DOWNSTREAM_STARTED", message: copy.resetParts.errors.DOWNSTREAM_STARTED(plan.heats.join(", ")) };
      p_draw = plan.draw;
      p_seats = plan.seats;
    }
  }
  const who = await roleOf(user, heat.event_id);
  const words = `${copy.walkover.audit.reopened(copy.walkover.audit.who[who], heatShortTitle(round?.short_name ?? round?.name ?? "", heat.number))} — ${reasonOf(reason)}`;
  const { error } = await user.rpc("walkover_reopen", { p_heat: heatId, p_reason: words, p_before: (p_draw ? draw : null) as never, p_draw: p_draw as never, p_seats: p_seats as never });
  return error ? fromDb(error) : { ok: true };
}
