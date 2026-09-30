import { z } from "zod";
import { copy } from "@/lib/ui-copy";

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

export const TimeZoneSchema = z.string().refine(isValidTimeZone, { message: copy.event.validation.timeZone });

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
  .min(2, copy.event.validation.slugMin)
  .max(40, copy.orgSettings.validation.slugMax)
  .regex(/^[a-z0-9][a-z0-9-]*$/, copy.event.validation.slugChars);

export const OrgNameSchema = z.string().trim().min(2, copy.orgSettings.validation.nameMin).max(80, copy.orgSettings.validation.nameMax);
