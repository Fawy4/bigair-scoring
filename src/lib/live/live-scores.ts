export type LiveScoresSetting = string | null | undefined;
export interface LiveScoresInput {
  /** The heat's own switch: true = show live, false = do not, null = follow the setting. */
  heat: boolean | null;
  /** The division's setting (null = use the event's). */
  division: LiveScoresSetting;
  /** The event's setting. */
  event: LiveScoresSetting;
}

/** The same rule the database applies: the heat's own switch, else the division's setting, else the event's, else "after publish" (not live). */
const defaultIsPublic = (i: LiveScoresInput): boolean => (i.division || i.event || "after_publish") === "live";

export function liveScoresState(i: LiveScoresInput): { isPublic: boolean; followsDefault: boolean } {
  return i.heat === null ? { isPublic: defaultIsPublic(i), followsDefault: true } : { isPublic: i.heat, followsDefault: false };
}

/** One tap flips what the public sees. When that equals what the setting would give anyway, the heat goes back to following the setting (null). */
export function nextLiveScoresValue(i: LiveScoresInput): boolean | null {
  const flipped = !liveScoresState(i).isPublic;
  return flipped === defaultIsPublic(i) ? null : flipped;
}
