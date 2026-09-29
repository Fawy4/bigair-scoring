import { z } from "zod";

/** Time zones the browser and Node know about (docs/06 §12 decision 18). */
export function knownTimeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Africa/Cairo"];
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const TimeZoneSchema = z.string().refine(isValidTimeZone, { message: "Not a known time zone (for example Africa/Cairo)" });

export const OrgSettingsSchema = z.object({
  defaultTimezone: TimeZoneSchema.default("Africa/Cairo"),
});
export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

/** Tolerant read: a broken or empty settings object falls back to the defaults. */
export function parseOrgSettings(json: unknown): OrgSettings {
  const r = OrgSettingsSchema.safeParse(json ?? {});
  return r.success ? r.data : { defaultTimezone: "Africa/Cairo" };
}

export const OrgSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "The web address needs at least 2 characters")
  .max(40, "The web address can be at most 40 characters")
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use only lowercase letters, numbers and hyphens, starting with a letter or number");

export const OrgNameSchema = z.string().trim().min(2, "Give the organisation a name").max(80, "That name is too long (80 characters at most)");
