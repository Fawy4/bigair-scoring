import { z } from "zod";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";

const T = copy.registration.errors;

const text = (max: number) => z.string().trim().max(max, T.tooLong(max));

/** What the public registration form sends. `website` is the hidden honeypot: people leave it empty, scripts fill it. */
export const RegistrationFormSchema = z.object({
  divisionId: z.string().uuid(T.division),
  first: z.string().trim().min(1, T.first).max(60, T.tooLong(60)),
  last: z.string().trim().min(1, T.last).max(60, T.tooLong(60)),
  email: z.string().trim().toLowerCase().max(254, T.tooLong(254)).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, T.email),
  phone: text(30).default(""),
  nationality: text(60).default(""),
  sponsor: text(100).default(""),
  wooId: text(40).default(""),
  kiteBrand: text(60).optional(),
  kiteModel: text(60).optional(),
  kiteSize: text(10).optional(),
  kiteColours: text(60).optional(),
  rashguardColour: text(40).optional(),
  photoPath: z.string().max(300).optional(),
  consent: z.literal(true, { error: T.consent }),
  website: z.string().max(200).default(""),
});
export type RegistrationForm = z.infer<typeof RegistrationFormSchema>;

export type ParsedRegistration = { ok: true; value: RegistrationForm } | { ok: false; spam: boolean; fields: Record<string, string> };

export function parseRegistration(input: unknown): ParsedRegistration {
  const honeypot = input && typeof input === "object" ? String((input as { website?: unknown }).website ?? "") : "";
  if (honeypot.trim() !== "") return { ok: false, spam: true, fields: {} };
  const r = RegistrationFormSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = String(issue.path[0] ?? "form");
    if (!fields[k]) fields[k] = issue.message;
  }
  return { ok: false, spam: false, fields };
}

/** The identifiers the division's scheme needs from the rider (lycras are handed out by the organiser). */
export function askedIdentifiers(scheme: IdentificationScheme): { kite: string[]; rashguard: boolean; photo: boolean } {
  const all = new Set<string>([scheme.primary, ...(scheme.fallbackPrimary ? [scheme.fallbackPrimary] : []), ...scheme.secondary]);
  const kiteWanted = all.has("kite") || all.has("kite_size_colour") || scheme.kiteFields.length > 0;
  const kite = kiteWanted ? (scheme.kiteFields.length ? [...scheme.kiteFields] : ["size", "colours"]) : [];
  return { kite: kite as string[], rashguard: all.has("rashguard_colour"), photo: all.has("photo") };
}
