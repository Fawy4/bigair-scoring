import { previewFormat } from "@/lib/format-ui/preview";
import { schemeFor } from "./schemes";
import { mergeOverrides, FORMAT_NULLABLE } from "@/lib/scoring-ui/overrides";
import { describePanel, describeScoringModel } from "@/lib/scoring-ui/describe";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { modelOf } from "./results-model";
import type { PublicRules, PublicSite } from "./types";

const W = copy.rulesText;
const num = (n: number) => String(Math.round(n * 1000) / 1000);

export interface RulesSection {
  key: "scoring" | "counting" | "impression" | "judges" | "tiebreakers" | "penalties" | "format" | "identification";
  heading: string;
  lines: string[];
}

export interface RulesDivisionVM {
  id: string;
  name: string;
  description: string | null;
  /** The one-sentence summary ("Best 3 of 7 attempts + Variety 0–10, 3 judges averaged"). */
  summary: string | null;
  sections: RulesSection[];
  legend: Array<{ key: string; label: string; hex: string }>;
}

function scoringLines(m: ScoringModel): string[] {
  const t = m.trick;
  const lines: string[] = [];
  if (t.entry === "single") lines.push(W.singleScore(num(t.scale.min), num(t.scale.max), num(t.scale.step)));
  else if (t.entry === "criteria") {
    lines.push(W.criteriaIntro, ...t.criteria.map((c) => W.criterion(c.label, num(c.scale.min), num(c.scale.max), c.help ?? "")));
    lines.push(t.combine === "sum" ? W.combineSum : W.combineMean);
  } else lines.push(W.noTrickScores);
  if (t.entry !== "none") lines.push(t.crash === "zero" ? W.crashZero : W.crashNot);
  return lines;
}

function countingLines(m: ScoringModel): string[] {
  const c = m.heat.counting;
  const lines: string[] = [];
  if (c.type === "best_n") lines.push(W.bestN(c.n, c.distinctTrickNames));
  else if (c.type === "best_per_category") lines.push(W.perCategory(c.maxPerCategory, c.categoriesCounted ? W.groupsBest(c.categoriesCounted) : ""));
  else if (c.type === "single_best") lines.push(W.singleBest);
  else if (c.type === "all") lines.push(W.allCount);
  else lines.push(W.noneCount);
  if (m.heat.countedWeights?.some((w) => w !== 1)) lines.push(W.weights(m.heat.countedWeights.map(num).join(" / ")));
  if (m.heat.trickWeight !== 1 && c.type !== "none") lines.push(W.trickWeight(num(m.heat.trickWeight)));
  lines.push(m.heat.maxAttemptsPerRider ? W.attemptCap(m.heat.maxAttemptsPerRider) : W.noCap);
  return lines;
}

function impressionLines(m: ScoringModel): string[] {
  const i = m.heat.impression;
  if (!i) return [W.noImpression];
  return [W.impression(i.label, num(i.scale.min), num(i.scale.max), i.weight !== 1 ? num(i.weight) : ""), ...(i.help ? [i.help] : []), ...(i.required ? [W.impressionRequired] : [])];
}

function penaltyLines(m: ScoringModel): string[] {
  const p = m.modifiers.interference;
  const t = W.interference;
  const lines = [p.penalty === "drop_best_trick" ? t.drop_best_trick : p.penalty === "percent" ? t.percent(num(p.value ?? 0)) : p.penalty === "points" ? t.points(num(p.value ?? 0)) : t.none];
  lines.push(W.dnsDsq, m.modifiers.dnf.keepScores ? W.dnfKeep : W.dnfLose);
  if (m.heightSensor.enabled || m.heightSensor.award.highestJump) lines.push(W.height);
  return lines;
}

function identificationLines(scheme: IdentificationScheme): string[] {
  const lines = [W.primary[scheme.primary] ?? W.primary.name];
  if (scheme.primary === "vest_colour" || scheme.fallbackPrimary === "vest_colour") lines.push(scheme.vestAssignment === "per_heat_slot" ? W.perHeatColour : W.fixedColour, W.legendLycra);
  return lines;
}

/**
 * The rules page of every division, generated from its scoring model and format (nothing is typed by hand): what scores, what counts, the Impression score, the
 * judges, tie-breakers, penalties, the heats and how riders move on, and how to tell the riders apart. A division whose model or format cannot be read still gets
 * the sections that can. Pure.
 */
export function buildRules(rules: PublicRules | null, site: PublicSite | null): RulesDivisionVM[] {
  if (!rules || !site) return [];
  return rules.divisions.map((d): RulesDivisionVM => {
    const model = modelOf(rules, d.id);
    const scheme = schemeFor(site, d.id);
    const sections: RulesSection[] = [];
    if (model) {
      sections.push({ key: "scoring", heading: copy.pub.rules.scoring, lines: scoringLines(model) });
      sections.push({ key: "counting", heading: copy.pub.rules.counting, lines: countingLines(model) });
      sections.push({ key: "impression", heading: copy.pub.rules.impression, lines: impressionLines(model) });
      sections.push({ key: "judges", heading: copy.pub.rules.judges, lines: [describePanel(model.panel), W.decimals(model.panel.decimals)] });
      sections.push({ key: "tiebreakers", heading: copy.pub.rules.tiebreakers, lines: [W.tieIntro, ...model.tieBreakers.map((t, i) => `${i + 1}. ${W.tie[t] ?? t}`)] });
      sections.push({ key: "penalties", heading: copy.pub.rules.penalties, lines: penaltyLines(model) });
    }
    if (d.format_template) {
      try {
        const template = parseFormatTemplate(mergeOverrides(d.format_template as never, d.format_params, FORMAT_NULLABLE));
        const riders = Math.max(d.riders, 2);
        const preview = previewFormat(template, riders);
        if (preview.ok) {
          const lines = [preview.sentence, ...preview.ladder.flatMap((c) => [`${c.name}: ${c.summary}`, ...c.routes.map((r) => `   ${r}`)]), W.minHeats(preview.minHeatsPerRider)];
          if (preview.timeSentence) lines.push(preview.timeSentence);
          sections.push({ key: "format", heading: copy.pub.rules.format, lines });
        }
      } catch {
        /* a format that cannot be read is left out */
      }
    }
    sections.push({ key: "identification", heading: copy.pub.rules.identification, lines: identificationLines(scheme) });
    const usesLycra = scheme.primary === "vest_colour" || scheme.fallbackPrimary === "vest_colour";
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      summary: model ? describeScoringModel(model) : null,
      sections,
      legend: usesLycra ? scheme.palette.map((c) => ({ key: c.key, label: c.label, hex: c.hex })) : [],
    };
  });
}
