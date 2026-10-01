import { z } from "zod";

/** `divisions.live_settings`: what a division's live screens show. Unknown keys written by later phases are kept. */
export const DivisionLiveSchema = z.looseObject({
  /** "Show scores as % of maximum" (Advanced, off). The scoring model's own `heat.total.display` is only the default for exports. */
  showPercentOfMax: z.boolean().default(false),
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

export function parseDivisionLive(json: unknown): DivisionLive {
  const r = DivisionLiveSchema.safeParse(json && typeof json === "object" ? json : {});
  return r.success ? r.data : DivisionLiveSchema.parse({});
}

/** Only an explicit "on" shows a percentage on a screen (docs/08 §1G-10). */
export const showPercent = (live: unknown): boolean => parseDivisionLive(live).showPercentOfMax === true;
