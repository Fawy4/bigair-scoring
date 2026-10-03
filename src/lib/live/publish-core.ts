import type { SupabaseClient } from "@supabase/supabase-js";
import { drawProjection } from "@/lib/draw/projection";
import { applyHeatStatuses } from "@/lib/draw/entrants";
import { applyHeatResult, type DivisionDraw, type DrawHeat } from "@/lib/engine/ladder";
import { computeHeat, roundHalfUp, type TieDecision } from "@/lib/engine/scoring";
import { toLadderResult } from "@/lib/engine/scoring/ladder-adapter";
import { mergeOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { parseDivisionLive } from "@/lib/schemas/division-live";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { parseScoringModel } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { errorSentence, parseError } from "./errors";
import { heatInputFromRows } from "./heat-input";
import { judgeWordFor } from "./judge-names";
import { publishChecklist, type ChecklistItem } from "./publish-checklist";
import { effectiveUnsubmitted } from "./sheet-rule";
import { ATTEMPT_COLUMNS, IMPRESSION_COLUMNS, SCORE_COLUMNS, SLOT_COLUMNS, type AttemptRow, type ImpressionRow, type ScoreRow, type SlotRow } from "./types";
import { effectiveSetting, holdAtPublish } from "./visibility";
import { softWord } from "./words";

export type PublishResult =
  | { ok: true; version: number; already: boolean }
  | { ok: false; code: string | null; message: string; blockers?: ChecklistItem[]; canOverride?: boolean; detail?: string };

const fail = (code: string | null, message?: string): PublishResult => ({ ok: false, code, message: message ?? errorSentence(code) });


/** Judge seats are replaced by "J1", "J2" … so the public breakdown never carries a seat id. */
function scrub<T>(value: T, seatNo: Map<string, number>): T {
  let text = JSON.stringify(value);
  for (const [seat, n] of seatNo) text = text.split(seat).join(`J${n}`);
  return JSON.parse(text) as T;
}

/**
 * Publish (docs/PLAN-phase-5 step 5). The caller's rights are checked first (the head judge, or an organiser of the event); then the heat is loaded, scored
 * with the same engine the console uses, the blockers are worded, the ladder is advanced in memory (a heat that has already started that this result feeds is
 * returned as a conflict, nothing written), and everything is written by `publish_heat_commit` in one transaction. Pressing Publish twice gives one result.
 */
export async function publishHeatCore(
  db: { user: SupabaseClient; service: SupabaseClient },
  heatId: string,
  opts: { overrideReason?: string; labels?: Record<string, string> } = {},
): Promise<PublishResult> {
  const { service } = db;
  const { data: heat } = await service.from("heats").select("id, event_id, division_id, round_id, status, draw_uid, number, name").eq("id", heatId).maybeSingle();
  if (!heat) return fail("HEAT_NOT_FOUND");
  const { data: isHead } = await db.user.rpc("am_i_head", { p_event: heat.event_id });
  const {
    data: { user },
  } = await db.user.auth.getUser();
  if (!isHead || !user) return fail("NOT_ALLOWED");

  const { data: latestRows } = await service.from("heat_results").select("version").eq("heat_id", heatId).order("version", { ascending: false }).limit(1);
  const latest = latestRows?.[0]?.version ?? 0;
  if (heat.status === "published") return { ok: true, version: latest, already: true };
  if (heat.status !== "ended" && heat.status !== "under_review") return fail("HEAT_NOT_ENDED");

  const [{ data: event }, { data: division }, { data: slots }, { data: attempts }, { data: scores }, { data: impressions }, { data: penalties }, { data: decisions }, { data: sheets }, { data: divisionHeats }, { data: entries }] =
    await Promise.all([
      service.from("events").select("settings").eq("id", heat.event_id).single(),
      service.from("divisions").select("id, scoring_model_id, scoring_overrides, panel_id, live_settings, draw").eq("id", heat.division_id).single(),
      service.from("heat_slots").select(SLOT_COLUMNS).eq("heat_id", heatId),
      service.from("trick_attempts").select(ATTEMPT_COLUMNS).eq("heat_id", heatId),
      service.from("trick_scores").select(SCORE_COLUMNS).eq("heat_id", heatId),
      service.from("impression_scores").select(IMPRESSION_COLUMNS).eq("heat_id", heatId),
      service.from("penalties").select("heat_id, entry_id, type, reason").eq("heat_id", heatId),
      service.from("heat_decisions").select("payload, reason, at").eq("heat_id", heatId).eq("kind", "tie").order("at"),
      service.from("judge_sheets").select("judge_seat_id, submitted_at, reopened_at").eq("heat_id", heatId),
      service.from("heats").select("id, draw_uid, status, started_at").eq("division_id", heat.division_id),
      service.from("v_entries").select("id, first_name, last_name").eq("event_id", heat.event_id),
    ]);
  if (!division) return fail("HEAT_NOT_FOUND");
  const { data: modelRow } = division.scoring_model_id ? await service.from("scoring_models").select("json").eq("id", division.scoring_model_id).single() : { data: null };
  let model;
  try {
    model = parseScoringModel(mergeOverrides(modelRow?.json as never, division.scoring_overrides, SCORING_NULLABLE));
  } catch {
    return fail(null, copy.publish.noModel);
  }

  // the panel in seat order, and who has submitted
  const { data: members } = division.panel_id ? await service.from("panel_members").select("judge_seat_id, seat_no").eq("panel_id", division.panel_id).order("seat_no") : { data: [] as Array<{ judge_seat_id: string; seat_no: number }> };
  const { data: seats } = await service.from("judge_seats").select("id, name, active, status").in("id", (members ?? []).map((m) => m.judge_seat_id));
  const live = new Set((seats ?? []).filter((s) => s.active && s.status === "active").map((s) => s.id));
  const panelSeatIds = (members ?? []).map((m) => m.judge_seat_id).filter((id) => live.has(id));
  const seatNo = new Map((members ?? []).map((m, i) => [m.judge_seat_id, i + 1] as const));
  const judgeWord = judgeWordFor((members ?? []).map((m) => m.judge_seat_id), Object.fromEntries((seats ?? []).map((s) => [s.id, s.name] as const)));

  const tieDecisions: TieDecision[] = (decisions ?? []).flatMap((d) => {
    const ids = (d.payload as { riderIds?: unknown } | null)?.riderIds;
    return Array.isArray(ids) ? [{ riderIds: ids.filter((x): x is string => typeof x === "string"), reason: d.reason ?? "" }] : [];
  });
  const input = heatInputFromRows(model, panelSeatIds, (slots ?? []) as SlotRow[], (attempts ?? []) as AttemptRow[], (scores ?? []) as ScoreRow[], (impressions ?? []) as ImpressionRow[], penalties ?? [], tieDecisions);
  let result;
  try {
    result = computeHeat(model, input);
  } catch (e) {
    return fail(null, e instanceof Error ? e.message : copy.liveErrors.unknown);
  }

  // words for the blockers: the rider's colour (or name), the judge's seat name
  const slotColour = new Map((slots ?? []).map((s) => [s.entry_id, s.vest_colour] as const));
  const nameOf = new Map((entries ?? []).map((e) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Rider"] as const));
  const labelOf = (id: string) => opts.labels?.[id] ?? (slotColour.get(id) ? softWord(String(slotColour.get(id))) : nameOf.get(id) ?? "Rider");
  // decision P2-1: a sheet the head judge settled with Absent marks (nothing missing any more) counts as submitted
  const unsubmitted = effectiveUnsubmitted({ panelSeatIds, sheets: sheets ?? [], blockers: result.publishBlockers, scores: (scores ?? []) as ScoreRow[], impressions: (impressions ?? []) as ImpressionRow[] });
  const checklist = publishChecklist({
    blockers: result.publishBlockers,
    unsubmitted,
    judgeWord,
    attemptIdOf: (rider, seq) => ((attempts ?? []) as AttemptRow[]).find((a) => a.entry_id === rider && a.seq === seq && !a.deleted_at)?.id,
    riderLabel: (id) => softWord(labelOf(id)),
    impressionLabel: copy.checklist.impressionWord,
  });
  const reason = opts.overrideReason?.trim() ?? "";
  if (checklist.items.length > 0) {
    if (!checklist.canOverride) return { ok: false, code: "PUBLISH_BLOCKED", message: errorSentence("PUBLISH_BLOCKED"), blockers: checklist.items, canOverride: false };
    if (reason.length < 3) return { ok: false, code: "PUBLISH_BLOCKED", message: errorSentence("PUBLISH_BLOCKED"), blockers: checklist.items, canOverride: true };
  }

  // the ladder: places into the draw, the next heats' seats from the result; a heat that has started is never changed
  const draw = (division.draw ?? null) as DivisionDraw | null;
  const drawHeat = draw && heat.draw_uid ? draw.rounds.flatMap((r) => r.heats).find((h: DrawHeat) => (h.uid ?? h.id) === heat.draw_uid) : undefined;
  let newDraw: DivisionDraw | null = null;
  let projection: Array<{ uid: string; slots: Array<{ position: number; entry_id: string | null; modifier: string | null }> }> = [];
  let roundIsLast = false;
  if (draw && drawHeat) {
    const synced = applyHeatStatuses(draw, divisionHeats ?? []);
    let applied;
    try {
      applied = applyHeatResult(synced, drawHeat.id, toLadderResult(model, result));
    } catch (e) {
      return fail("DRAW_MISMATCH", e instanceof Error ? e.message : undefined);
    }
    if (applied.conflict) {
      const names = applied.conflict.affectedHeats.map((a) => {
        const h = applied.draw.rounds.flatMap((r) => r.heats).find((x) => x.id === a.heatId);
        return h?.name ?? (h?.number ? `Heat ${h.number}` : a.heatId);
      });
      return fail("DOWNSTREAM_STARTED", copy.publish.downstream(names));
    }
    newDraw = applied.draw;
    const before = new Map(drawProjection(synced).heats.map((h) => [h.uid, h]));
    const key = (s: { entry_id: string | null; modifier: string | null }) => `${s.entry_id ?? ""}|${s.modifier ?? ""}`;
    projection = drawProjection(newDraw).heats
      .filter((h) => h.uid !== (drawHeat.uid ?? drawHeat.id))
      .filter((h) => (before.get(h.uid)?.slots ?? []).map(key).join(",") !== h.slots.map(key).join(","))
      .map((h) => ({ uid: h.uid, slots: h.slots.map((s) => ({ position: s.position, entry_id: s.entry_id, modifier: s.modifier })) }));
    roundIsLast = draw.rounds[draw.rounds.length - 1]?.id === drawHeat.round;
  }

  const settings = parseEventSettings(event?.settings);
  const dl = parseDivisionLive(division.live_settings);
  const hold = holdAtPublish({
    holdFinalResult: effectiveSetting(dl.holdFinalResult, settings.holdFinalResult),
    publicResultsOnPublish: effectiveSetting(dl.publicResultsOnPublish, settings.publicResultsOnPublish),
    roundIsLast,
  });

  const byId = new Map(result.riders.map((r) => [r.riderId, r]));
  const results = result.ranking.map((x) => {
    const r = byId.get(x.riderId)!;
    const none = x.status === "DNS" || x.status === "DSQ";
    return {
      entry_id: x.riderId,
      place: x.place,
      total: none ? null : x.total,
      percent: none || r.percent === null ? null : roundHalfUp(r.percent, 2),
      breakdown: scrub(r, seatNo),
    };
  });

  const { data, error } = await service.rpc("publish_heat_commit", {
    p_heat: heatId,
    p_expected_version: latest + 1,
    p_results: results as never,
    p_draw: (newDraw ?? null) as never,
    p_projection: projection as never,
    p_hold: hold,
    p_override_reason: (reason || null) as never,
    p_actor: user.id,
    p_blockers: (checklist.items.map((i) => ({ kind: i.kind, text: i.text })) as never),
  });
  if (error) return { ok: false, code: parseError(error.message).code, message: errorSentence(error.message), detail: error.message };
  const out = data as { version: number; already: boolean };
  return { ok: true, version: out.version, already: out.already };
}
