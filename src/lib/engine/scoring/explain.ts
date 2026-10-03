import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { formatScore } from "./round";
import type { AdjustedMark, RiderResult } from "./types";

const num = (x: number) => String(Number(x.toFixed(4)));

/** One line for a mark the engine could not use as given (audit A1a-3): what was entered, what was wrong, what was counted. */
function adjustedLine(a: AdjustedMark): string {
  const where = a.attemptSeq === null ? a.label : `${a.label} on attempt #${a.attemptSeq}`;
  const who = `${a.judgeId}: ${where}`;
  const used = a.used === null ? "not counted" : `counted as ${num(a.used)}`;
  switch (a.problem) {
    case "off_step":
      return `${who} ${num(a.given)} is not on the ${num(a.step)} step, ${used}`;
    case "out_of_range":
      return `${who} is ${num(a.given)}, outside ${num(a.min)}–${num(a.max)}, ${used}`;
    case "not_a_number":
      return `${who} is not a number, ${used}`;
    case "unreadable":
      return `${who} could not be read, ${used}`;
  }
}

/** Plain-language breakdown lines for the head judge, riders and commentators. */
export function explain(r: RiderResult, model: ScoringModel): string[] {
  const d = model.panel.decimals;
  const f = (x: number) => formatScore(x, d);

  if (r.status === "DNS") return ["Did not start — no score, placed last."];
  if (r.status === "DSQ") return ["Disqualified — no score, placed last."];

  const lines: string[] = [];
  if (r.status === "DNF") {
    lines.push(model.modifiers.dnf.keepScores ? "Did not finish — keeps the scores earned before stopping." : "Did not finish — scores removed.");
  }

  const dropped = r.allAttempts.filter((a) => a.ignored === "interference_dropped");
  if (model.heat.counting.type !== "none") {
    const sum = r.counted.reduce((s, c) => s + c.score, 0);
    const parts = r.counted.map((c) => f(c.score)).join(" + ");
    const label = dropped.length > 0 ? "Counted tricks (after interference)" : "Counted tricks";
    lines.push(r.counted.length > 0 ? `${label}: ${parts} = ${f(sum)}` : `${label}: none yet`);
    if (r.counted.length > 0) {
      lines.push(`  (attempts ${r.counted.map((c) => `#${c.attemptSeq}`).join(", ")})`);
    }
    const weights = model.heat.countedWeights;
    if (weights && r.counted.some((_, i) => (weights[i] ?? 1) !== 1)) {
      const parts = r.counted.map((c, i) => {
        const w = weights[i] ?? 1;
        return `${f(c.score)} × ${w} = ${f(c.score * w)}`;
      });
      const weighted = r.counted.reduce((s, c, i) => s + c.score * (weights[i] ?? 1), 0);
      lines.push(`Weighted: ${parts.join("; ")} → ${f(weighted)}`);
    }
    if (model.heat.trickWeight !== 1) {
      lines.push(`Tricks × ${model.heat.trickWeight} = ${f(r.components.tricks - (dropped.length > 0 ? r.components.penalty : 0))}`);
    }
  }

  const notCounted = r.allAttempts
    .filter((a) => !a.counted && a.ignored !== "interference_dropped")
    .map((a) => {
      if (a.ignored === "over_cap") return `#${a.seq} over the ${r.attemptCap}-attempt limit (ignored)`;
      if (a.status === "crashed") return `#${a.seq} crashed`;
      if (a.score === null) return `#${a.seq} no score`;
      return `#${a.seq} ${f(a.score)}`;
    });
  if (notCounted.length > 0 && model.trick.entry !== "none") lines.push(`Not counted: ${notCounted.join("; ")}`);

  const imp = model.heat.impression;
  if (imp && r.impression) {
    const marks = r.impression.judgeScores.map((j) => `${j.judgeId} ${j.score}`).join(", ");
    const value = r.impression.score === null ? "not entered yet" : f(r.components.impression);
    lines.push(`${imp.label}: ${value}${marks ? ` (${marks})` : ""}`);
  }

  if (r.components.bonus > 0) lines.push(`Height bonus: +${f(r.components.bonus)}`);
  if (r.components.penalty > 0) {
    lines.push(
      dropped.length > 0
        ? `Interference: best trick ${dropped.map((a) => `#${a.seq} (${f(a.score ?? 0)})`).join(", ")} dropped → −${f(r.components.penalty)}`
        : `Interference penalty: −${f(r.components.penalty)}`,
    );
  }

  for (const a of r.adjustedMarks) lines.push(adjustedLine(a));

  lines.push(r.percent !== null ? `Total ${f(r.total)} (${f(r.percent)}%)` : `Total ${f(r.total)}`);
  if (r.flags.incomplete) lines.push("Some judges' marks are still missing.");
  if (r.flags.extraAttemptsIgnored) lines.push("Attempts beyond the limit were ignored.");
  return lines;
}
