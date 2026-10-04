import { z } from "zod";

/** The speeds of the heat clock (the heat's length is divided by this when it starts). */
export const SPEEDS = [1, 5, 10, 20] as const;
export type Speed = (typeof SPEEDS)[number];
export const isSpeed = (n: number): n is Speed => (SPEEDS as readonly number[]).includes(n);

export const SPREADS = ["agree", "normal", "disagree"] as const;
export type SpreadMode = (typeof SPREADS)[number];

/** One of these can be switched on for one judge of the panel at a time. */
export const JUDGE_MODES = ["none", "misses", "offline", "late"] as const;
export type JudgeMode = (typeof JUDGE_MODES)[number];

/**
 * How the virtual people behave (stored as sim_control.config). Every number has a default so an empty object is a working setup; the panel edits them.
 * `armed`, `tie`, `dead`, `windHeld` and `finalHeldHeat` are the scenario buttons' own memory (what is waiting for its moment, which riders are forced to tie, which judge's phone died).
 */
export const SimConfigSchema = z.object({
  attemptsPerRider: z.number().int().min(1).max(20).default(5),
  crashShare: z.number().min(0).max(0.9).default(0.2),
  repeatShare: z.number().min(0).max(0.5).default(0.1),
  spread: z.enum(SPREADS).default("normal"),
  judgeMode: z.enum(JUDGE_MODES).default("none"),
  /** The panel position (1, 2, 3 …) the judge mode applies to. */
  specialJudge: z.number().int().min(1).max(9).default(2),
  /** Share of attempts the "misses" judge does not see. */
  missShare: z.number().min(0.05).max(0.9).default(0.3),
  /** Seconds on the heat's normal clock; at ×10 a minute offline lasts six seconds of the shortened clock. */
  offlineSec: z.number().int().min(10).max(300).default(60),
  lateSec: z.number().int().min(5).max(120).default(20),
  armed: z.array(z.string()).default([]),
  tie: z.object({ heatId: z.string(), entryA: z.string(), entryB: z.string() }).nullable().default(null),
  dead: z.object({ heatId: z.string(), seatId: z.string() }).nullable().default(null),
  /** Wind hold pressed and not yet resumed. */
  windHeld: z.boolean().default(false),
  /** The final's result was held back by the scenario and waits to be released. */
  finalHeldHeat: z.string().nullable().default(null),
  /** "Run the whole event": every day's run order in turn, until every heat (the finals too) is published (Polish 2, item 7). */
  wholeEvent: z.boolean().default(false),
  /** "Skip to end of heat" left this heat in review: the virtual head judge does not publish it; whoever presses Publish (or "End heat and publish") does (Polish 3, item 1). */
  reviewHold: z.string().nullable().default(null),
});
export type SimConfig = z.infer<typeof SimConfigSchema>;

export const defaultSimConfig = (): SimConfig => SimConfigSchema.parse({});

/** Never throws: whatever is stored, the simulator gets a working setup (anything unreadable falls back to the defaults). */
export function parseSimConfig(json: unknown): SimConfig {
  const r = SimConfigSchema.safeParse(json ?? {});
  return r.success ? r.data : defaultSimConfig();
}

/** The settings the owner can change in the panel (the rest is the scenarios' memory). */
export type SimSettings = Pick<SimConfig, "attemptsPerRider" | "crashShare" | "repeatShare" | "spread" | "judgeMode" | "specialJudge" | "missShare" | "offlineSec" | "lateSec">;

export function withSettings(config: SimConfig, patch: Partial<SimSettings>): SimConfig {
  return SimConfigSchema.parse({ ...config, ...patch });
}

const SETTING_KEYS = ["attemptsPerRider", "crashShare", "repeatShare", "spread", "judgeMode", "specialJudge", "missShare", "offlineSec", "lateSec"] as const satisfies ReadonlyArray<keyof SimSettings>;

/**
 * What the panel sends when one setting changes, checked: exactly the keys it sent, each valid, nothing else. Null when anything is wrong (nothing is saved then).
 * Zod fills a field's default even inside `.partial()`, so the keys that were not sent are dropped here: saving one setting never changes another (Polish 2, item 4).
 */
export function parseSettingsPatch(patch: Record<string, unknown>): Partial<SimSettings> | null {
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some((k) => !(SETTING_KEYS as readonly string[]).includes(k))) return null;
  const parsed = SimConfigSchema.pick({ attemptsPerRider: true, crashShare: true, repeatShare: true, spread: true, judgeMode: true, specialJudge: true, missShare: true, offlineSec: true, lateSec: true }).partial().safeParse(patch);
  if (!parsed.success) return null;
  return Object.fromEntries(Object.entries(parsed.data).filter(([k]) => keys.includes(k))) as Partial<SimSettings>;
}
