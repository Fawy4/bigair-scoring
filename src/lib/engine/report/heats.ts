import { heatLength, heatNumber, mean, roundName, type Attempt, type RiderHeat } from "./collect";
import type { HeatRow, JumpLine, ReportContext, ReportRound, TimelinePoint } from "./types";

const r2 = (x: number): number => Math.round(x * 100) / 100;

function timeline(attempts: Attempt[], length: number): TimelinePoint[] {
  return attempts.map((t, i) => ({
    x: t.at_sec !== null && length > 0 ? Math.min(1, Math.max(0, t.at_sec / length)) : (i + 1) / (attempts.length + 1),
    seconds: t.at_sec,
    score: t.status === "landed" ? t.score : null,
    landed: t.status === "landed",
    counted: t.counted,
    trick: t.key ? t.label : null,
  }));
}

/** The average panel score of every landed trick of the heat (the dashed line of the timeline); null when nothing was scored. */
export function fieldAverage(rh: RiderHeat): number | null {
  const scores = rh.heat.results.flatMap((r) => r.attempts.filter((a) => a.status === "landed" && a.ignored !== "over_cap" && a.score !== null).map((a) => a.score as number));
  return mean(scores);
}

const targetOf = (round: ReportRound, place: number | null, rounds: ReportRound[]): { to: string | null; final: boolean } => {
  if (place === null) return { to: null, final: false };
  const rule = (round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(place)) ?? (round.advance ?? []).find((a) => a.places === "rest");
  if (!rule || rule.to === "eliminated") return { to: null, final: false };
  if (rule.to === "final_placing") return { to: null, final: true };
  return { to: (() => {
      const r = rounds.find((x) => x.draw_round === rule.to);
      return r ? roundName(r) : null;
    })(), final: false };
};

/** The heat card of one heat the rider rode. */
export function heatRow(rh: RiderHeat, ctx: ReportContext, rounds: ReportRound[], cap: number | null): HeatRow {
  const res = rh.result;
  const total = res?.total ?? null;
  const place = res?.place ?? null;
  const ok = rh.heat.results.filter((r) => (!r.status || r.status === "ok") && r.total !== null);
  const target = targetOf(rh.round, place, rounds);
  const isFinal = rh.roundIndex === rounds.length - 1 || target.final;
  // behind: in the final the place above him, in every other heat the winner
  let behind: HeatRow["behind"] = null;
  if (total !== null && place !== null && place > 1) {
    const above = isFinal ? ok.find((r) => r.place === place - 1) : ok.find((r) => r.place === 1);
    if (above && above.entry_id !== rh.entryId) {
      const gap = r2(Number(above.total) - Number(total));
      if (gap > 0) behind = { gap, to: isFinal && place - 1 > 1 ? place - 1 : "winner" };
    }
  }
  const jumps = rh.attempts.length;
  const crashes = rh.attempts.filter((t) => t.status === "crashed").length;
  const firsts = rh.attempts.filter((t) => t.status === "landed" && t.at_sec !== null).map((t) => t.at_sec as number);
  const length = rh.lengthSec || heatLength(rh.heat);
  const jumpLines: JumpLine[] = rh.attempts.map((t) => ({
    seq: t.seq,
    at_sec: t.at_sec,
    trick: t.key ? t.label : null,
    side: t.direction === "left" || t.direction === "right" ? t.direction : null,
    landed: t.status === "landed",
    score: t.status === "landed" ? t.score : null,
    counted: t.counted,
  }));
  return {
    heatId: rh.heat.id,
    roundName: roundName(rh.round),
    heatNo: `Heat ${heatNumber(rh.heat)}`,
    outcome: rh.outcome,
    place,
    toRound: target.to,
    isFinal,
    lycra: ctx.lycraHex ? ctx.lycraHex(rh.divisionId, rh.vest) : null,
    total,
    tricksTotal: res?.tricks_total ?? null,
    impression: res?.impression ?? null,
    behind,
    jumps,
    cap: rh.cap ?? cap,
    crashes,
    crashRate: jumps ? crashes / jumps : null,
    firstLandedAt: firsts.length ? Math.min(...firsts) : null,
    paceSec: jumps ? Math.round(length / jumps) : null,
    lengthSec: length,
    fieldAverage: fieldAverage(rh),
    timeline: timeline(rh.attempts, length),
    jumpLines,
  };
}
