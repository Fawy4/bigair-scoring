import { z } from "zod";
import { TimeZoneSchema } from "./org-settings";
import { IdentificationSchemeSchema } from "./identification";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Everything on `events.settings` that the Event step edits. Unknown keys written by later phases are kept. */
export const EventSettingsSchema = z.looseObject({
  publicLiveScores: z.enum(["live", "after_publish", "off"]).default("after_publish"),
  /** Minutes before a heat that riders are called to the ready area. */
  readyCallMin: z.number().int().min(0).max(120).default(10),
  /** How often public pages ask for new scores. */
  livePollSec: z.number().int().min(3).max(60).default(7),
  /** How long judges may still enter marks after a heat ends. */
  judgeGraceSec: z.number().int().min(0).max(3600).default(180),
  judgesMayLogAttempts: z.boolean().default(false),
  /** Show the wind-call banner on public pages and the big screen (Phase 5 adds the calls themselves). */
  windCallBanner: z.boolean().default(true),
  registrationOpen: z.boolean().default(false),
  /** Last day riders can register (the whole day counts, in the event's time zone). */
  registrationClosesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use a date").nullable().optional(),
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
  name: z.string().trim().min(1, "give the sponsor a name").max(80),
  logoUrl: z.string().url().optional(),
  url: z.union([z.literal(""), z.string().url("a full web address, starting with https://")]).optional(),
});

export const EventBrandingSchema = z.looseObject({
  logoUrl: z.string().url().optional(),
  sponsors: z.array(SponsorSchema).max(20, "at most 20 sponsors").default([]),
});
export type EventBranding = z.infer<typeof EventBrandingSchema>;

export const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "The web address needs at least 2 characters")
  .max(60, "The web address can be at most 60 characters")
  .regex(SLUG, "Use only lowercase letters, numbers and hyphens, starting with a letter or number");

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/** The whole Event step as one form. */
export const EventFormSchema = z
  .object({
    name: z.string().trim().min(2, "Give the event a name").max(100, "That name is too long (100 characters at most)"),
    slug: SlugSchema,
    location: z.string().trim().max(120, "Location is too long").default(""),
    start_date: DateOnly,
    end_date: DateOnly,
    timezone: TimeZoneSchema,
    settings: EventSettingsSchema,
    branding: EventBrandingSchema,
  })
  .superRefine((f, ctx) => {
    if (f.end_date < f.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "The last day cannot be before the first day" });
    }
    const closes = f.settings.registrationClosesOn;
    if (f.settings.registrationOpen && closes && closes > f.end_date) {
      ctx.addIssue({ code: "custom", path: ["settings", "registrationClosesOn"], message: "Registration cannot close after the event has ended" });
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
