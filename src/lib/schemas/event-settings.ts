import { z } from "zod";
import { TimeZoneSchema } from "./org-settings";
import { IdentificationSchemeSchema } from "./identification";
import { FlagSettingsSchema } from "./flags";
import { tabsOffLeavesOne } from "@/lib/public/tabs";
import { copy } from "@/lib/ui-copy";

const v = copy.event.validation;

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** One extra tab on the public site: a leaderboard that lives elsewhere (for example the Highest Jump board of WOO Events). */
export const ExternalLeaderboardSchema = z.object({
  title: z.string().trim().min(1, v.leaderboardTitle).max(40, v.leaderboardTitle),
  /** https only: the page opens in a new tab, or is shown inside the site when `embed` is on. */
  url: z.string().trim().url(v.leaderboardUrl).refine((u) => u.startsWith("https://"), v.leaderboardUrl),
  embed: z.boolean().default(false),
});
export type ExternalLeaderboard = z.infer<typeof ExternalLeaderboardSchema>;

/** Everything on `events.settings` that the Event step edits. Unknown keys written by later phases are kept. */
export const EventSettingsSchema = z.looseObject({
  /** "live" = the public may follow scores during a heat; anything else = nothing before the head judge publishes. */
  publicLiveScores: z.enum(["live", "after_publish", "off"]).default("after_publish"),
  /** Publishing a heat shows its result to the public at once (otherwise a result is released by hand). */
  publicResultsOnPublish: z.boolean().default(false),
  /** The final's result stays hidden until the organiser releases it (podium). Uses heats.publish_hold. */
  holdFinalResult: z.boolean().default(false),
  /** Minutes before a heat that riders are called to the ready area. The one place this is set: the run order, the timetables and the rider pages all read it. */
  readyCallMin: z.number().int().min(0).max(120).default(15),
  /** How often public pages ask for new scores. */
  livePollSec: z.number().int().min(3).max(60).default(7),
  /** Seconds each page of the big screen stays up before the next one (live heat, timetable, last results, sponsors). */
  screenRotateSec: z.number().int().min(5).max(120).default(20),
  /** The big screen's colours when a browser has not chosen its own: dark ground with white text, or Day (dark text on a light ground). */
  screenColourMode: z.enum(["dark", "day"]).default("dark"),
  /** The public event page's tabs the organiser switched off (keys such as "rules", "join", "leaderboard-1"); empty = every tab is on. */
  publicTabsOff: z.array(z.string()).default([]),
  /** Extra tabs on the public site that link to (or show) a leaderboard kept elsewhere. */
  externalLeaderboards: z.array(ExternalLeaderboardSchema).max(6, v.leaderboardsMax).default([]),
  /** No longer read (since 5b a judge's scores lock at Submit or at review); kept so older events still parse. */
  judgeGraceSec: z.number().int().min(0).max(3600).default(180),
  /** What the separate score per rider is called on every screen (the Scoring card of the Event step): "Impression", "Variety"… Empty = each division keeps the name its own scoring gives it. */
  impressionName: z.string().trim().max(24, v.impressionName).default(""),
  /** The flag states and the start sequence (the Flags card of the Event step). On by default. */
  flags: FlagSettingsSchema.default(() => FlagSettingsSchema.parse({})),
  /** Heats that may run (or be paused) at the same time in this event. */
  maxRunningHeats: z.number().int().min(1).max(5).default(1),
  judgesMayLogAttempts: z.boolean().default(false),
  /** Show the wind-call banner on public pages and the big screen (Phase 5 adds the calls themselves). */
  windCallBanner: z.boolean().default(true),
  registrationOpen: z.boolean().default(false),
  /** Last day riders can register (the whole day counts, in the event's time zone). */
  registrationClosesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, v.useDate).nullable().optional(),
  /** Hour and minute of the closing day (event time zone). Empty = the whole day counts. */
  registrationClosesTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, v.useTime).nullable().optional(),
  /** Riders per division that can register; the next one sees "Full — ask the organiser". Empty = no limit. */
  registrationMaxPerDivision: z.number().int(v.wholeNumber).min(1, v.maxPerDivision).max(500, v.maxPerDivision).nullable().optional(),
  /** Shown on the registration page while registration is closed. */
  registrationClosedMessage: z.string().trim().max(300, v.closedMessageMax).optional(),
  identification: z
    .object({
      scheme: IdentificationSchemeSchema,
      /** The preset the scheme started from (for display only). */
      basedOn: z.string().optional(),
      allowDivisionOverride: z.boolean().default(false),
    })
    .optional(),
});
export type EventSettings = z.infer<typeof EventSettingsSchema>;

export const SponsorSchema = z.object({
  name: z.string().trim().min(1, v.sponsorName).max(80),
  logoUrl: z.string().url().optional(),
  url: z.union([z.literal(""), z.string().url(v.sponsorUrl)]).optional(),
});

export const EventBrandingSchema = z.looseObject({
  logoUrl: z.string().url().optional(),
  sponsors: z.array(SponsorSchema).max(20, v.sponsorsMax).default([]),
});
export type EventBranding = z.infer<typeof EventBrandingSchema>;

export const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, v.slugMin)
  .max(60, v.slugMax)
  .regex(SLUG, v.slugChars);

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, v.pickDate);

/** The whole Event step as one form. */
export const EventFormSchema = z
  .object({
    name: z.string().trim().min(2, v.nameMin).max(100, v.nameMax),
    slug: SlugSchema,
    location: z.string().trim().max(120, v.locationMax).default(""),
    start_date: DateOnly,
    end_date: DateOnly,
    timezone: TimeZoneSchema,
    settings: EventSettingsSchema,
    branding: EventBrandingSchema,
    /** A simulation event is never public (Practice heat, rehearsals). It can be set only before a heat has started. */
    isSimulation: z.boolean().default(false),
  })
  .superRefine((f, ctx) => {
    if (f.end_date < f.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: v.endBeforeStart });
    }
    if (!tabsOffLeavesOne(f.settings.publicTabsOff, f.settings.externalLeaderboards)) {
      ctx.addIssue({ code: "custom", path: ["settings", "publicTabsOff"], message: v.oneTabOn });
    }
    const closes = f.settings.registrationClosesOn;
    if (f.settings.registrationClosesTime && !closes) {
      ctx.addIssue({ code: "custom", path: ["settings", "registrationClosesOn"], message: v.timeNeedsDate });
    }
    if (f.settings.registrationOpen && closes && closes > f.end_date) {
      ctx.addIssue({ code: "custom", path: ["settings", "registrationClosesOn"], message: v.closesAfterEnd });
    }
  });
export type EventForm = z.infer<typeof EventFormSchema>;

export function parseEventSettings(json: unknown): EventSettings {
  const r = EventSettingsSchema.safeParse(json ?? {});
  return r.success ? r.data : EventSettingsSchema.parse({});
}

export function parseEventBranding(json: unknown): EventBranding {
  const r = EventBrandingSchema.safeParse(json ?? {});
  return r.success ? r.data : EventBrandingSchema.parse({});
}

/** "Arrow Big Air 2026" → "arrow-big-air-2026" */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
