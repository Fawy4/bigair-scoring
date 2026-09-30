import { IdentificationSchemeSchema, type IdentificationScheme } from "@/lib/schemas/identification";

/** The scheme stored on a division (`{ scheme }` or the scheme itself), or null when there is none or it is not valid. */
export function divisionScheme(stored: unknown): IdentificationScheme | null {
  const raw = stored && typeof stored === "object" && "scheme" in stored ? (stored as { scheme: unknown }).scheme : stored;
  const r = IdentificationSchemeSchema.safeParse(raw);
  return r.success ? r.data : null;
}
