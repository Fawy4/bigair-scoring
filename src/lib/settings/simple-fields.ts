import { copy, help, type Help } from "@/lib/ui-copy";

/** One Simple dial: where its value lives, the label it wears and the entry of `help` behind its “?”. */
export interface SimpleField {
  id: string;
  /** The path in the settings document (Scoring) or the form field (Event, Format). */
  path: string;
  label: string;
  helpKey: string;
}

/** Scoring tab, Simple: best N of M attempts, judges, how their scores are combined, Impression / Variety on or off and its scale (docs/06 decision 32). */
export const SCORING_SIMPLE: readonly SimpleField[] = [
  { id: "bestN", path: "heat.counting.n", label: copy.scoringSimple.n, helpKey: "scoring.n" },
  { id: "attempts", path: "heat.maxAttemptsPerRider", label: copy.scoringSimple.attempts, helpKey: "scoring.attempts" },
  { id: "judges", path: "panel.minJudges", label: copy.scoringSimple.judges, helpKey: "scoring.judges" },
  { id: "aggregate", path: "panel.aggregate", label: copy.scoringSimple.aggregate, helpKey: "scoring.aggregate" },
  { id: "impression", path: "heat.impression", label: copy.scoringSimple.impression, helpKey: "scoring.impression" },
  { id: "impressionMax", path: "heat.impression.scale.max", label: copy.scoringSimple.impressionHigh, helpKey: "scoring.impressionRange" },
];

/** Format tab, Simple: ladder type, riders per heat (target, minimum, maximum), how many advance, final size, heat length per round. */
export const FORMAT_SIMPLE: readonly SimpleField[] = [
  { id: "type", path: "generator.type", label: copy.formatSimple.typeHeading, helpKey: "format.type" },
  { id: "heatSize", path: "generator.params.heatSize", label: copy.formatSimple.ridersPerHeat, helpKey: "format.heatSize" },
  { id: "minHeat", path: "generator.params.minHeatSize", label: copy.formatSimple.minRiders, helpKey: "format.minHeat" },
  { id: "maxHeat", path: "generator.params.maxHeatSize", label: copy.formatSimple.maxRiders, helpKey: "format.maxHeat" },
  { id: "advance", path: "generator.params.advancePerHeat", label: copy.formatSimple.advancePerHeat, helpKey: "format.advance" },
  { id: "finalSize", path: "generator.params.finalSize", label: copy.formatSimple.finalSize, helpKey: "format.finalSize" },
  { id: "perRound", path: "roundDurationMin", label: copy.formatSimple.perRound.heading, helpKey: "format.perRound" },
];

/** Event step, Simple: name, dates, place, time zone, coloured lycras yes or no, what spectators see. */
export const EVENT_SIMPLE: readonly SimpleField[] = [
  { id: "name", path: "name", label: copy.event.name, helpKey: "event.name" },
  { id: "dates", path: "start_date", label: copy.event.firstDay, helpKey: "event.dates" },
  { id: "location", path: "location", label: copy.event.location, helpKey: "event.location" },
  { id: "timeZone", path: "timezone", label: copy.event.timeZone, helpKey: "event.timeZone" },
  { id: "lycra", path: "settings.identification", label: copy.ident.lycraQuestion, helpKey: "ident.lycraQuestion" },
  { id: "visibility", path: "settings.publicLiveScores", label: copy.event.visibilityHeading, helpKey: "event.visibility" },
];

/** What a row shows for a Simple dial: its label, the one line under it and the example behind the “?”. */
export function simpleText(f: SimpleField): { label: string; explanation: string; example?: string } {
  const h: Help = help[f.helpKey];
  return { label: f.label, explanation: h.line ?? h.text, example: h.example };
}
