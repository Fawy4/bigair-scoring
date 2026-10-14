import { z } from "zod";

/** `divisions.live_settings`: what a division's live screens show. Unknown keys written by later phases are kept. */
export const DivisionLiveSchema = z.looseObject({
  /** "Show scores as % of maximum" (Advanced, off). The scoring model's own `heat.total.display` is only the default for exports. */
  showPercentOfMax: z.boolean().default(false),
  /**
   * What a division shows the public. null = use the event's own setting (the event's boxes are the default, a division may override them: owner, decision 4).
   * `publicLiveScores`: live during the heat, or only after the head judge publishes. `holdFinalResult` / `publicResultsOnPublish` as in the event step.
   */
  publicLiveScores: z.enum(["live", "after_publish", "off"]).nullable().default(null),
  publicResultsOnPublish: z.boolean().nullable().default(null),
  holdFinalResult: z.boolean().nullable().default(null),
  /** What a spectator sees in each attempt box (docs/PLAN-phase-5 step 6): the attempt number and its score (Arrow's default), the trick name and its score, or scores only. */
  spectatorAttemptDisplay: z.enum(["number_score", "trick_score", "score_only"]).default("number_score"),
  /** The parts of the compact card above the Impression / Variety pad (all on). */
  impressionSummary: z
    .object({
      counts: z.boolean().default(true),
      variety: z.boolean().default(true),
      directions: z.boolean().default(true),
      landedList: z.boolean().default(true),
    })
    .default({ counts: true, variety: true, directions: true, landedList: true }),
});
export type DivisionLive = z.infer<typeof DivisionLiveSchema>;


/** What one change of the Live screens panel carries: only the setting the organiser touched (a part of the summary card as `{ impressionSummary: { variety: false } }`). */
export type DivisionLivePatch = Partial<Omit<DivisionLive, "impressionSummary">> & { impressionSummary?: Partial<DivisionLive["impressionSummary"]> };
const PATCHABLE = ["showPercentOfMax", "publicLiveScores", "publicResultsOnPublish", "holdFinalResult", "spectatorAttemptDisplay", "impressionSummary"] as const;

/**
 * The stored settings after the organiser changed some of them: the stored object as it is, with only the touched settings replaced. Everything else stays exactly as
 * stored, including a setting that was never stored (it is not written down as its default), a stale page cannot bring an old value of another setting back, and keys
 * this code does not know are kept. A patch key that is not a setting is ignored.
 */
export function mergeLiveSettings(stored: unknown, patch: DivisionLivePatch): Record<string, unknown> {
  const base: Record<string, unknown> = stored && typeof stored === "object" && !Array.isArray(stored) ? { ...(stored as Record<string, unknown>) } : {};
  for (const key of PATCHABLE) {
    if (!(key in patch) || patch[key] === undefined) continue;
    if (key === "impressionSummary") {
      const before = base.impressionSummary && typeof base.impressionSummary === "object" ? (base.impressionSummary as Record<string, unknown>) : {};
      base.impressionSummary = { ...before, ...patch.impressionSummary };
    } else base[key] = patch[key];
  }
  return base;
}

export function parseDivisionLive(json: unknown): DivisionLive {
  const r = DivisionLiveSchema.safeParse(json && typeof json === "object" ? json : {});
  return r.success ? r.data : DivisionLiveSchema.parse({});
}

/** Only an explicit "on" shows a percentage on a screen (docs/08 §1G-10). */
export const showPercent = (live: unknown): boolean => parseDivisionLive(live).showPercentOfMax === true;
