/** Who sees what, and when (docs/08 §1H-11). */

/** A result is held back at publish when this is the final and the event holds finals, or when results are not public on publish at all. */
export function holdAtPublish(input: { holdFinalResult: boolean; publicResultsOnPublish: boolean; roundIsLast: boolean }): boolean {
  return (input.holdFinalResult && input.roundIsLast) || !input.publicResultsOnPublish;
}

/** A division's own value wins over the event's; null means "use the event's". */
export function effectiveSetting<T>(division: T | null | undefined, event: T): T {
  return division === null || division === undefined ? event : division;
}

export type LiveScoresSetting = "live" | "after_publish" | string;

/** Live scores for one heat: the head judge's switch for the heat, then the division's setting, then the event's. */
export function liveScoresOn(input: { heat: boolean | null; division: LiveScoresSetting | null; event: LiveScoresSetting }): boolean {
  if (input.heat !== null) return input.heat;
  return effectiveSetting(input.division, input.event) === "live";
}
