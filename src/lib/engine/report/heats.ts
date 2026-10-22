import { heatLength, mean, type Attempt, type RiderHeat } from "./collect";
import type { HeatRow, JumpLine, TimelinePoint } from "./types";

const r2 = (x: number): number => Math.round(x * 100) / 100;

function timeline(attempts: Attempt[], length: number): TimelinePoint[] {
  return attempts.map((t, i) => ({
    x: t.at_sec !== null && length > 0 ? Math.min(1, Math.max(0, t.at_sec / length)) : (i + 1) / (attempts.length + 1),
    seconds: t.at_sec,
    score: t.status === "landed" ? t.score : null,
    landed: t.status === "landed",
    counted: t.counted,
  }));
}

/** The average panel score of every landed trick of the heat (the dashed line of the timeline); null when nothing was scored. */
export function fieldAverage(rh: RiderHeat): number | null {
  const scores = rh.heat.results.flatMap((r) => r.attempts.filter((a) => a.status === "landed" && a.ignored !== "over_cap" && a.score !== null).map((a) => a.score as number));
  return mean(scores);
}

/** The heat-by-heat card of one heat the rider rode (or did not ride). */
export function heatRow(rh: RiderHeat): HeatRow {
  const res = rh.result;
  const total = res?.total ?? null;
  const ok = rh.heat.results.filter((r) => (!r.status || r.status === "ok") && r.total !== null);
  const winner = ok.find((r) => r.place === 1);
  const gapToWinner = rh.outcome !== "won" && winner && winner.entry_id !== rh.entryId && total !== null ? r2(Number(winner.total) - Number(total)) : null;
  // the place that went through: the lowest total of the riders who advanced from this heat (when the rider did not)
  const rules = rh.round.advance ?? [];
  const advanced = ok.filter((r) => {
    const rule = rules.find((a) => Array.isArray(a.places) && a.places.includes(r.place as number));
    return rule && rule.to !== "eliminated" && rule.to !== "final_placing";
  });
  const gapToThrough = rh.outcome === "out" && total !== null && advanced.length ? r2(Math.min(...advanced.map((r) => Number(r.total))) - Number(total)) : null;
  const next = ok.filter((r) => r.entry_id !== rh.entryId).sort((a, b) => Number(b.total) - Number(a.total))[0];
  const leadOverNext = rh.outcome === "won" && total !== null && next ? r2(Number(total) - Number(next.total)) : null;
  const jumps = rh.attempts.length;
  const crashes = rh.attempts.filter((t) => t.status === "crashed").length;
  const firsts = rh.attempts.filter((t) => t.status === "landed" && t.at_sec !== null).map((t) => t.at_sec as number);
  const length = rh.lengthSec || heatLength(rh.heat);
  const jumpLines: JumpLine[] = rh.attempts.map((t) => ({ seq: t.seq, at_sec: t.at_sec, trick: t.key ? t.label : t.label || null, side: t.direction, landed: t.status === "landed", score: t.status === "landed" ? t.score : null, counted: t.counted }));
  return {
    heatId: rh.heat.id,
    roundName: rh.round.name,
    heatLabel: rh.title,
    outcome: rh.outcome,
    place: res?.place ?? null,
    total,
    tricksTotal: res?.tricks_total ?? null,
    impression: res?.impression ?? null,
    gapToWinner,
    gapToThrough,
    leadOverNext,
    jumps,
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
