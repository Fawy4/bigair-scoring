import { z } from "zod";

/**
 * Schedule — the day's run order across divisions, with anchors, breaks, hold and alternative plans.
 * Spec: docs/04-FORMAT-LADDER-SPEC.md §7 (+ Decisions log §9). Preset: presets/schedule/kitemania-day2.json.
 * Actual heat start/end times are NOT stored here: they come from the heats' server timestamps (Decision 9).
 */

export const HhMmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (24 h)");
const IsoInstantSchema = z.iso.datetime({ offset: true });

export const HeatRefSchema = z.object({
  division: z.string().min(1),
  round: z.string().min(1),
  heat: z.string().min(1),
});

const RunHeatItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("heat"),
    heatId: z.string().min(1).optional(),
    heatRef: HeatRefSchema.optional(),
    durationMin: z.number().positive().optional(),
    /** Warm-up before this heat in minutes; absent = the division's (per round) setting. The competition timer is only `durationMin`. */
    warmUpMin: z.number().min(0).optional(),
    breakAfterMin: z.number().min(0).optional(),
  })
  .refine((i) => Boolean(i.heatId) !== Boolean(i.heatRef), {
    message: "a heat item needs exactly one of heatId or heatRef",
  });

const RunBreakItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("break"),
  label: z.string().min(1),
  durationMin: z.number().positive(),
});

const RunNoteItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("note"),
  label: z.string().min(1),
});

export const RunItemSchema = z.union([RunHeatItemSchema, RunBreakItemSchema, RunNoteItemSchema]);

export const ScheduleDefaultsSchema = z.object({
  breakAfterHeatMin: z.number().min(0).default(3),
  breakAfterRoundMin: z.number().min(0).default(5),
  readyCallMin: z.number().min(0).default(15),
});

export const SchedulePlanSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    active: z.boolean().default(false),
    items: z.array(RunItemSchema),
    /** itemId → "HH:MM" pin in the event time zone. A pin means "not before" (Decision 8). */
    anchors: z.record(z.string(), HhMmSchema).default({}),
    /** itemId → ISO instant. Only for break/note items; heat actuals come from the heats (Decision 9). */
    actualStarts: z.record(z.string(), IsoInstantSchema).default({}),
    hold: z.object({ since: IsoInstantSchema, reason: z.string().optional() }).optional(),
    expectedFinish: HhMmSchema.optional(),
  })
  .superRefine((plan, ctx) => {
    const byId = new Map<string, (typeof plan.items)[number]>();
    plan.items.forEach((item, i) => {
      if (byId.has(item.id)) ctx.addIssue({ code: "custom", message: `duplicate item id "${item.id}"`, path: ["items", i, "id"] });
      byId.set(item.id, item);
    });
    for (const id of Object.keys(plan.anchors)) {
      if (!byId.has(id)) ctx.addIssue({ code: "custom", message: `anchor on unknown item "${id}"`, path: ["anchors", id] });
    }
    for (const id of Object.keys(plan.actualStarts)) {
      const item = byId.get(id);
      if (!item) ctx.addIssue({ code: "custom", message: `actual start on unknown item "${id}"`, path: ["actualStarts", id] });
      else if (item.kind === "heat") {
        ctx.addIssue({ code: "custom", message: `"${id}" is a heat: its actual start comes from the heat, not the plan`, path: ["actualStarts", id] });
      }
    }
  });

export const ScheduleDaySchema = z
  .object({
    eventDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "eventDay must be YYYY-MM-DD"),
    timezone: z.string().min(1).refine(isValidTimeZone, { message: "unknown IANA time zone" }),
    defaults: ScheduleDefaultsSchema.prefault({}),
    plans: z.array(SchedulePlanSchema).min(1),
  })
  .superRefine((day, ctx) => {
    const active = day.plans.filter((p) => p.active).length;
    if (active !== 1) {
      ctx.addIssue({ code: "custom", message: `exactly one plan must be active (found ${active})`, path: ["plans"] });
    }
    const ids = new Set<string>();
    day.plans.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate plan id "${p.id}"`, path: ["plans", i, "id"] });
      ids.add(p.id);
    });
  });

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type HeatRef = z.infer<typeof HeatRefSchema>;
export type RunItem = z.infer<typeof RunItemSchema>;
export type RunHeatItem = z.infer<typeof RunHeatItemSchema>;
export type RunBreakItem = z.infer<typeof RunBreakItemSchema>;
export type ScheduleDefaults = z.infer<typeof ScheduleDefaultsSchema>;
export type SchedulePlan = z.infer<typeof SchedulePlanSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

/** Validates a schedule day and applies defaults. Throws ScheduleError with readable text. */
export function parseScheduleDay(json: unknown): ScheduleDay {
  const result = ScheduleDaySchema.safeParse(json);
  if (!result.success) {
    throw new ScheduleError(`Invalid schedule:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
