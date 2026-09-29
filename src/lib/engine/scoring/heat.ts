import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { flagPossibleDuplicates, repeatIndexes } from "./attempts";
import { selectCounted, type EligibleTrick } from "./counting";
import { judgeTrickScore } from "./judge";
import { panelScore, type PanelInput } from "./panel";
import { rankHeat } from "./rank";
import { assertOnStep, formatScore, roundHalfUp, ScoringInputError } from "./round";
import type {
  AttemptResult,
  HeatInput,
  HeatResult,
  PanelScore,
  PublishBlocker,
  RiderInput,
  RiderResult,
  RiderStatus,
} from "./types";

/**
 * The maximum possible heat total (for the percentage), or null when there is none
 * (e.g. counting "all" without an attempt cap). Decision log #6.
 */
export function maxRawFor(model: ScoringModel): number | null {
  const { heat, trick } = model;
  if (heat.total.maxRaw !== "auto") return heat.total.maxRaw;

  let countedSlots: number | null;
  switch (heat.counting.type) {
    case "best_n":
      countedSlots = heat.counting.n;
      break;
    case "single_best":
      countedSlots = 1;
      break;
    case "best_per_category":
      countedSlots =
        heat.counting.maxPerCategory * (heat.counting.categoriesCounted ?? model.categories.length);
      break;
    case "all":
      countedSlots = heat.maxAttemptsPerRider;
      break;
    case "none":
      countedSlots = 0;
      break;
  }
  if (countedSlots === null) return null;

  let max = countedSlots * trick.scale.max * heat.trickWeight;
  if (heat.impression) max += heat.impression.scale.max * heat.impression.weight;
  const hs = model.heightSensor;
  if (hs.enabled && hs.use === "bonus" && hs.bonus) max += hs.bonus.capPoints;
  return max > 0 ? max : null;
}

function riderStatus(rider: RiderInput): RiderStatus {
  const types = new Set((rider.modifiers ?? []).map((m) => m.type));
  if (types.has("DSQ")) return "DSQ";
  if (types.has("DNS")) return "DNS";
  if (types.has("DNF")) return "DNF";
  return "ok";
}

function attemptPanel(
  model: ScoringModel,
  attempt: RiderInput["attempts"][number],
  panelJudgeIds: string[],
): PanelScore {
  const onPanel = new Set(panelJudgeIds);
  const inputs: PanelInput[] = attempt.marks
    .filter((m) => onPanel.has(m.judgeId))
    .map((m) => {
      if (m.value === "missed") {
        if (!model.trick.allowNoScore) {
          throw new ScoringInputError(`Model "${model.id}" does not allow "Missed" (judge ${m.judgeId}, attempt ${attempt.seq})`);
        }
        return { judgeId: m.judgeId, score: "missed" };
      }
      const j = judgeTrickScore(model, m.value, { heightM: attempt.heightM });
      return { judgeId: m.judgeId, score: j.score, detail: j.detail };
    });
  return panelScore(model, inputs, panelJudgeIds);
}

/** Scores one rider in one heat (doc 03 §4). */
export function computeRider(
  model: ScoringModel,
  rider: RiderInput,
  panelJudgeIds: string[],
  maxRaw: number | null = maxRawFor(model),
): RiderResult {
  const d = model.panel.decimals;
  const status = riderStatus(rider);
  const modifiers = rider.modifiers ?? [];
  const keepsScores = status === "ok" || (status === "DNF" && model.modifiers.dnf.keepScores);

  const live = rider.attempts.filter((a) => !a.deleted).sort((a, b) => a.seq - b.seq);
  const cap = model.heat.maxAttemptsPerRider;
  const repeats = repeatIndexes(live);
  const dupes = new Map<number, number>();
  for (const a of flagPossibleDuplicates(live, model.heat.duplicateWindowSec)) {
    if (a.possibleDuplicateOf !== undefined) dupes.set(a.seq, a.possibleDuplicateOf);
  }

  const eligible: EligibleTrick[] = [];
  const uncategorised: number[] = [];
  const perCategory = model.heat.counting.type === "best_per_category";

  const allAttempts: AttemptResult[] = live.map((a, i) => {
    const r: AttemptResult = {
      seq: a.seq,
      status: a.status,
      trickName: a.trickName ?? null,
      categoryKey: a.categoryKey ?? null,
      panel: null,
      score: null,
      counted: false,
      repeatIndex: repeats.get(a.seq) ?? 0,
    };
    if (dupes.has(a.seq)) r.possibleDuplicateOf = dupes.get(a.seq);

    if (cap !== null && i >= cap) {
      r.ignored = "over_cap";
      return r;
    }
    if (a.status === "crashed") {
      if (model.trick.crash === "zero") {
        r.score = 0;
        eligible.push({ seq: a.seq, score: 0, categoryKey: r.categoryKey, trickName: r.trickName, landed: false });
      }
      r.ignored = "crashed";
      return r;
    }
    if (model.trick.entry === "none") {
      r.ignored = "no_score";
      return r;
    }
    r.panel = attemptPanel(model, a, panelJudgeIds);
    if (r.panel.judgeScores.some((j) => j.detail?.sensorMissing)) r.sensorMissing = true;
    r.score = r.panel.score;
    if (r.score === null) {
      r.ignored = "no_score";
      return r;
    }
    if (perCategory && r.categoryKey === null) uncategorised.push(a.seq);
    eligible.push({ seq: a.seq, score: r.score, categoryKey: r.categoryKey, trickName: r.trickName, landed: true });
    r.ignored = "not_selected";
    return r;
  });

  // Counting and interference.
  const interference = model.modifiers.interference;
  const intCount = modifiers.filter((m) => m.type === "INT").length;
  const effectiveInt = interference.allowMultiple ? intCount : Math.min(1, intCount);

  let counted = keepsScores ? selectCounted(model, eligible) : [];
  const sumScores = (list: EligibleTrick[]) => roundHalfUp(list.reduce((s, t) => s + t.score, 0), d);
  const tricks = roundHalfUp(model.heat.trickWeight * sumScores(counted), d);

  const dropped: number[] = [];
  if (interference.penalty === "drop_best_trick") {
    let pool = eligible;
    for (let k = 0; k < effectiveInt && counted.length > 0; k++) {
      const best = counted[0].seq;
      dropped.push(best);
      pool = pool.filter((t) => t.seq !== best);
      counted = selectCounted(model, pool);
    }
  }
  const tricksAfterDrop = roundHalfUp(model.heat.trickWeight * sumScores(counted), d);

  // Impression.
  let impression: PanelScore | null = null;
  let impressionPts = 0;
  const imp = model.heat.impression;
  if (imp) {
    const marks = (rider.impressionMarks ?? []).map((m) => {
      assertOnStep(m.value, imp.scale, imp.label);
      return { judgeId: m.judgeId, score: m.value };
    });
    impression = panelScore(model, marks, panelJudgeIds, imp.scale);
    if (keepsScores) impressionPts = roundHalfUp(imp.weight * (impression.score ?? 0), d);
  }

  // Height bonus.
  let bonus = 0;
  const hs = model.heightSensor;
  if (keepsScores && hs.enabled && hs.use === "bonus" && hs.bonus) {
    const heights = live
      .slice(0, cap ?? undefined)
      .filter((a) => a.status === "landed" && typeof a.heightM === "number")
      .map((a) => a.heightM as number);
    const maxH = rider.maxHeightM ?? (heights.length > 0 ? Math.max(...heights) : null);
    if (maxH !== null) {
      bonus = roundHalfUp(Math.min(hs.bonus.capPoints, hs.bonus.perMetreAbove * Math.max(0, maxH - hs.bonus.thresholdM)), d);
    }
  }

  // Penalty.
  let penalty = 0;
  if (keepsScores && effectiveInt > 0) {
    if (interference.penalty === "drop_best_trick") {
      penalty = roundHalfUp(tricks - tricksAfterDrop, d);
    } else if (interference.penalty === "percent") {
      penalty = roundHalfUp((effectiveInt * (interference.value ?? 0) * (tricks + impressionPts + bonus)) / 100, d);
    } else if (interference.penalty === "points") {
      penalty = roundHalfUp(effectiveInt * (interference.value ?? 0), d);
    }
  }

  const unroundedTotal = keepsScores ? tricks + impressionPts + bonus - penalty : 0;
  const total = Math.max(0, roundHalfUp(unroundedTotal, d)); // decision 5: never below 0

  // Mark counted / dropped / rider-status attempts.
  const countedSeqs = new Set(counted.map((t) => t.seq));
  for (const a of allAttempts) {
    if (countedSeqs.has(a.seq)) {
      a.counted = true;
      delete a.ignored;
    } else if (dropped.includes(a.seq)) {
      a.ignored = "interference_dropped";
    } else if (!keepsScores && a.ignored !== "over_cap") {
      a.ignored = "rider_status";
    }
  }

  const noScore = status === "DNS" || status === "DSQ";
  const withinCap = allAttempts.filter((a) => a.ignored !== "over_cap");

  return {
    riderId: rider.riderId,
    status,
    total,
    unroundedTotal,
    totalLabel: noScore ? "—" : formatScore(total, d),
    percent:
      !noScore && maxRaw !== null && model.heat.total.display !== "raw" ? roundHalfUp((total / maxRaw) * 100, d) : null,
    components: { tricks, impression: impressionPts, bonus, penalty },
    counted: counted.map((t) => ({ attemptSeq: t.seq, score: t.score, categoryKey: t.categoryKey })),
    allAttempts,
    impression,
    landedCount: withinCap.filter((a) => a.status === "landed").length,
    attemptCount: live.length,
    attemptCap: cap,
    interferenceCount: intCount,
    flags: {
      incomplete: withinCap.some((a) => a.panel?.incomplete) || (impression?.incomplete ?? false),
      outliers: allAttempts.filter((a) => a.panel?.outlier).map((a) => a.seq),
      extraAttemptsIgnored: allAttempts.some((a) => a.ignored === "over_cap"),
      sensorMissing: allAttempts.filter((a) => a.sensorMissing).map((a) => a.seq),
      uncategorised,
    },
    modifiers,
  };
}

function publishBlockers(model: ScoringModel, riders: RiderResult[]): PublishBlocker[] {
  const out: PublishBlocker[] = [];
  for (const r of riders) {
    if (r.status === "DNS" || r.status === "DSQ") continue;
    if (model.panel.requireAllJudges) {
      for (const a of r.allAttempts) {
        if (a.status !== "landed" || a.ignored === "over_cap" || !a.panel) continue;
        for (const judge of a.panel.missing) {
          out.push({ type: "score_missing", judge, rider: r.riderId, attemptSeq: a.seq });
        }
      }
    }
    if (model.heat.impression?.required && r.impression) {
      for (const judge of r.impression.missing) out.push({ type: "impression_missing", judge, rider: r.riderId });
    }
  }
  return out;
}

/**
 * Scores and ranks a whole heat. Totals are always returned (live scores keep flowing);
 * `publishBlockers` lists what must be fixed (or overridden by the head judge) before publishing.
 */
export function computeHeat(model: ScoringModel, input: HeatInput): HeatResult {
  const maxRaw = maxRawFor(model);
  const riders = input.riders.map((r) => computeRider(model, r, input.panelJudgeIds, maxRaw));
  const ranking = rankHeat(model, riders, input.headJudgeDecisions ?? []);

  const blockers = publishBlockers(model, riders);
  const tiedPlaces = new Map<number, string[]>();
  for (const r of ranking) {
    if (r.tieUnresolved) tiedPlaces.set(r.place, [...(tiedPlaces.get(r.place) ?? []), r.riderId]);
  }
  for (const ids of tiedPlaces.values()) blockers.push({ type: "tie_unresolved", riders: ids });

  return { riders, ranking, publishBlockers: blockers, maxRaw };
}
