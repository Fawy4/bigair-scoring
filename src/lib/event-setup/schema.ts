// The description of an event as its rulebook states it (RB1). One JSON file in presets/events/ per event; it holds NO personal details:
// rider and official names are given to the setup script when it runs (see scripts/setup-event.ts).
import { z } from "zod";
import { FLAG_KINDS } from "@/lib/schemas/flags";
import { TimeZoneSchema } from "@/lib/schemas/org-settings";
import { TieBreakerSchema } from "@/lib/schemas/scoring-model";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const FlagLook = z.object({ label: z.string().trim().min(1).max(24), colour: Hex });

const LadderRound = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  shortName: z.string().trim().min(1).max(24),
  /** Minutes the heat is on the water. */
  heatLengthMin: z.number().positive(),
  /** Minutes of start sequence before every heat of the round (the timetable's "warm-up"). */
  startSequenceMin: z.number().min(0),
  /** How many places of every heat go on (the top N). */
  advance: z.number().int().min(0).max(10),
  heats: z
    .array(
      z.object({
        /** The heat's number on the printed sheet; the numbers run 1, 2, 3 … across the rounds. */
        number: z.number().int().min(1),
        /** "seed 5" in the first round; "3rd H5" (third place of heat 5) after it. */
        seats: z.array(z.string().min(1)).min(1).max(10),
      }),
    )
    .min(1),
});

const Official = z.discriminatedUnion("role", [
  z.object({ role: z.literal("head"), key: z.string().min(1), scores: z.boolean().default(false) }),
  z.object({ role: z.literal("judge"), key: z.string().min(1), panel: z.boolean(), nameSuffix: z.string().max(30).optional() }),
  z.object({ role: z.literal("spotter"), name: z.string().trim().min(2).max(60) }),
  z.object({ role: z.literal("observer"), name: z.string().trim().min(2).max(60) }),
]);

export const EventDescriptionSchema = z.object({
  id: z.string().min(1),
  notes: z.array(z.string()).default([]),
  organisation: z.object({ nameContains: z.string().trim().min(2) }),
  event: z.object({
    name: z.string().trim().min(2).max(100),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    location: z.string().trim().max(120),
    timezone: TimeZoneSchema,
    startDate: Day,
    endDate: Day,
    status: z.literal("draft"),
    impressionName: z.string().trim().max(24),
  }),
  division: z.object({
    name: z.string().trim().min(2).max(60),
    riders: z.number().int().min(2).max(100),
    /** "Rider {n}" until the real name is given. */
    riderPlaceholder: z.string().includes("{n}"),
    scoring: z.object({ preset: z.string().min(1), overrides: z.object({ tieBreakers: z.array(TieBreakerSchema).min(1) }).partial() }),
  }),
  /** The event's Lycra colour list in seat order (one list for every heat: seat 1 gets the first colour). */
  lycra: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).min(1),
  flags: z.object({
    prestartSec: z.number().int().min(10).max(600),
    lastMinuteSec: z.number().int().min(10).max(600),
    states: z.object(Object.fromEntries(FLAG_KINDS.map((k) => [k, FlagLook])) as Record<(typeof FLAG_KINDS)[number], typeof FlagLook>),
  }),
  ladder: z.object({
    heatSize: z.object({ target: z.number().int().min(1).max(10), min: z.number().int().min(1).max(10), max: z.number().int().min(1).max(10) }),
    breakAfterHeatMin: z.number().min(0),
    breakAfterRoundMin: z.number().min(0),
    rounds: z.array(LadderRound).min(1),
  }),
  officials: z.array(Official).min(1),
  runOrder: z.object({ day: Day, name: z.string().trim().min(2).max(60), breakAfterHeatMin: z.number().min(0), breakAfterRoundMin: z.number().min(0), expectedMinutes: z.number().positive() }),
});

export type EventDescription = z.infer<typeof EventDescriptionSchema>;
export type LadderDescription = EventDescription["ladder"];

export function parseEventDescription(json: unknown): EventDescription {
  const r = EventDescriptionSchema.safeParse(json);
  if (!r.success) throw new Error(`The event description is not valid: ${z.prettifyError(r.error)}`);
  return r.data;
}
