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
import { impressionNameOf, withImpressionName } from "@/lib/schemas/impression-name";
import { copy } from "@/lib/ui-copy";
import { signedInUser } from "@/lib/supabase/claims";
import { errorSentence, parseError } from "./errors";
import { heatInputFromRows } from "./heat-input";
import { judgeWordFor } from "./judge-names";
import { publishChecklist, type ChecklistItem } from "./publish-checklist";
import { effectiveUnsubmitted } from "./sheet-rule";
import type { AttemptRow, ImpressionRow, ScoreRow, SlotRow } from "./types";
import { effectiveSetting, holdAtPublish } from "./visibility";
import { softWord } from "./words";

export type PublishResult =
  | { ok: true; version: number; already: boolean }
  | { ok: false; code: string | null; message: string; blockers?: ChecklistItem[]; canOverride?: boolean; detail?: string };

/** What `publish_heat_inputs` answers: the heat, its division, its scoring model, and every row the result is worked out from. */
export interface PublishInputs {
  heat: { id: string; event_id: string; division_id: string; round_id: string; status: string; draw_uid: string | null; number: number; name: string | null };
  latest: number;
  event_settings: unknown;
  division: { id: string; scoring_model_id: string | null; scoring_overrides: unknown; panel_id: string | null; live_settings: unknown; draw: unknown };
  model: unknown;
  slots: unknown[];
  attempts: unknown[];
  scores: unknown[];
  impressions: unknown[];
  penalties: Array<{ heat_id: string; entry_id: string; type: string; reason: string | null }>;
  decisions: Array<{ payload: unknown; reason: string | null; at: string }>;
  sheets: Array<{ judge_seat_id: string; submitted_at: string | null; reopened_at: string | null }>;
  division_heats: Array<{ id: string; draw_uid: string | null; status: string; started_at: string | null }>;
  entries: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  members: Array<{ judge_seat_id: string; seat_no: number }>;
  seats: Array<{ id: string; name: string; active: boolean; status: string }>;
}

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
  // one answer holds everything the result is worked out from, and the database checks in the same call that the caller is the head judge or an organiser
  const { data: got, error: readError } = await db.user.rpc("publish_heat_inputs", { p_heat: heatId });
  if (readError || !got) return { ok: false, code: parseError(readError?.message ?? "HEAT_NOT_FOUND").code, message: errorSentence(readError?.message ?? "HEAT_NOT_FOUND") };
  const user = await signedInUser(db.user);
  if (!user) return fail("NOT_ALLOWED");
  const read = got as unknown as PublishInputs;
  const { heat, latest, division, model: modelJson, members, seats, entries } = read;
  const slots = read.slots as SlotRow[];
  const attempts = read.attempts as AttemptRow[];
  const scores = read.scores as ScoreRow[];
  const impressions = read.impressions as ImpressionRow[];
  const { penalties, decisions, sheets, division_heats: divisionHeats } = read;
  const event = { settings: read.event_settings };

  if (heat.status === "published") return { ok: true, version: latest, already: true };
  if (heat.status !== "ended" && heat.status !== "under_review") return fail("HEAT_NOT_ENDED");

  let model;
  try {
    model = withImpressionName(parseScoringModel(mergeOverrides(modelJson as never, division.scoring_overrides as never, SCORING_NULLABLE)), parseEventSettings(event.settings).impressionName);
  } catch {
    return fail(null, copy.publish.noModel);
  }

  // the panel in seat order, and who has submitted
  const live = new Set(seats.filter((s) => s.active && s.status === "active").map((s) => s.id));
  const panelSeatIds = members.map((m) => m.judge_seat_id).filter((id) => live.has(id));
  const seatNo = new Map(members.map((m, i) => [m.judge_seat_id, i + 1] as const));
  const judgeWord = judgeWordFor(members.map((m) => m.judge_seat_id), Object.fromEntries(seats.map((s) => [s.id, s.name] as const)));

  const tieDecisions: TieDecision[] = decisions.flatMap((d) => {
    const ids = (d.payload as { riderIds?: unknown } | null)?.riderIds;
    return Array.isArray(ids) ? [{ riderIds: ids.filter((x): x is string => typeof x === "string"), reason: d.reason ?? "" }] : [];
  });
  const input = heatInputFromRows(model, panelSeatIds, slots, attempts, scores, impressions, penalties, tieDecisions);
  let result;
  try {
    result = computeHeat(model, input);
  } catch (e) {
    return fail(null, e instanceof Error ? e.message : copy.liveErrors.unknown);
  }

  // words for the blockers: the rider's colour (or name), the judge's seat name
  const slotColour = new Map(slots.map((s) => [s.entry_id, s.vest_colour] as const));
  const nameOf = new Map(entries.map((e) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Rider"] as const));
  const labelOf = (id: string) => opts.labels?.[id] ?? (slotColour.get(id) ? softWord(String(slotColour.get(id))) : nameOf.get(id) ?? "Rider");
  // decision P2-1: a sheet the head judge settled with Absent marks (nothing missing any more) counts as submitted
  const unsubmitted = effectiveUnsubmitted({ panelSeatIds, sheets, blockers: result.publishBlockers, scores, impressions });
  const checklist = publishChecklist({
    blockers: result.publishBlockers,
    unsubmitted,
    judgeWord,
    attemptIdOf: (rider, seq) => attempts.find((a) => a.entry_id === rider && a.seq === seq && !a.deleted_at)?.id,
    riderLabel: (id) => softWord(labelOf(id)),
    impressionLabel: copy.checklist.impressionWord(impressionNameOf(model)),
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
    const synced = applyHeatStatuses(draw, divisionHeats);
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
