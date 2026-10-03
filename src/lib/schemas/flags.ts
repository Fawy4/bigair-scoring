import { z } from "zod";

/** The four flag states. Fixed: an event changes how they look, never how many there are. */
export const FLAG_KINDS = ["before_start", "running", "last_minute", "stopped"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;
const Look = (label: string, colour: string) =>
  z.object({
    label: z.string().trim().min(1).max(24).default(label),
    colour: z.string().regex(HEX).default(colour),
  });

/** Everything on `events.settings.flags` (the Flags card of the Event step). Switched ON by default for every event. */
export const FlagSettingsSchema = z.object({
  /** On: the clock drives the flags (start sequence, flag strip, Flag view). Off: every screen looks as it did before flags. */
  enabled: z.boolean().default(true),
  states: z
    .object({
      before_start: Look("Before start", "#FACC15").default({ label: "Before start", colour: "#FACC15" }),
      running: Look("Running", "#15803D").default({ label: "Running", colour: "#15803D" }),
      last_minute: Look("Last minute", "#FACC15").default({ label: "Last minute", colour: "#FACC15" }),
      stopped: Look("Stopped", "#DC2626").default({ label: "Stopped", colour: "#DC2626" }),
    })
    .default({
      before_start: { label: "Before start", colour: "#FACC15" },
      running: { label: "Running", colour: "#15803D" },
      last_minute: { label: "Last minute", colour: "#FACC15" },
      stopped: { label: "Stopped", colour: "#DC2626" },
    }),
  /** Seconds of yellow before the heat starts by itself. */
  prestartSec: z.number().int().min(10).max(600).default(60),
  /** The last part of the heat, in seconds remaining, that shows the Last minute flag. */
  lastMinuteSec: z.number().int().min(10).max(600).default(60),
});
export type FlagSettings = z.infer<typeof FlagSettingsSchema>;

export const DEFAULT_FLAGS: FlagSettings = FlagSettingsSchema.parse({});

/** Never throws: a damaged value falls back to the defaults (flags on). */
export function parseFlagSettings(json: unknown): FlagSettings {
  const r = FlagSettingsSchema.safeParse(json ?? {});
  return r.success ? r.data : DEFAULT_FLAGS;
}
