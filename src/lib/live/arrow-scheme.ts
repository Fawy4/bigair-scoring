import { IdentificationSchemeSchema, type IdentificationScheme } from "@/lib/schemas/identification";

/** The organisation address of the first live customer (the Arrow launch event). Only the /design page uses it, to show their real Rider label scheme. */
export const ARROW_ORG_SLUG = "arrow";

/** The scheme the organiser saved in an event's settings, or null when there is none or it does not parse. */
export function schemeFromSettings(settings: unknown): IdentificationScheme | null {
  if (!settings || typeof settings !== "object") return null;
  const ident = (settings as { identification?: unknown }).identification;
  if (!ident || typeof ident !== "object") return null;
  const r = IdentificationSchemeSchema.safeParse((ident as { scheme?: unknown }).scheme);
  return r.success ? r.data : null;
}
