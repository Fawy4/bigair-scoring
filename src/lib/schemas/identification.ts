import { z } from "zod";
import schemesFile from "../../../presets/identification/schemes.json";
import { copy } from "@/lib/ui-copy";

/**
 * Rider identification scheme (docs/06 §0). One primary identifier shown big on every rider chip, secondary ones small.
 * The palette travels with the scheme, so an event keeps working even if the preset it started from changes later.
 */
export const PaletteColourSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, copy.ident.validation.colourKey),
  label: z.string().trim().min(1, copy.ident.validation.colourName),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, copy.ident.validation.colourHex),
});

export const PrimaryIdentifierSchema = z.enum(["name", "vest_colour", "bib_number", "kite", "rashguard_colour", "helmet_colour", "photo"]);
export const SecondaryIdentifierSchema = z.enum([
  "name",
  "nationality",
  "sponsor",
  "vest_colour",
  "bib_number",
  "kite",
  "kite_size_colour",
  "rashguard_colour",
  "helmet_colour",
  "photo",
]);

export const IdentificationSchemeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, copy.ident.validation.schemeName),
    description: z.string().optional(),
    primary: PrimaryIdentifierSchema,
    /** Used when the primary identifier is not available on the day (e.g. no vests). */
    fallbackPrimary: PrimaryIdentifierSchema.optional(),
    secondary: z.array(SecondaryIdentifierSchema).default([]),
    vestAssignment: z.enum(["per_heat_slot", "fixed_per_rider", "none"]).default("none"),
    bibNumbering: z.enum(["none", "per_event", "per_division"]).default("none"),
    kiteFields: z.array(z.enum(["brand", "model", "size", "colours"])).default([]),
    /** What the spotter calls out: the colour ("Red"), the number ("14") or the kite ("Blue Orbit"). */
    calloutLabel: z.enum(["colour", "number", "kite", "name"]).default("colour"),
    palette: z.array(PaletteColourSchema).min(1, copy.ident.validation.paletteMin),
  })
  .superRefine((s, ctx) => {
    const keys = s.palette.map((c) => c.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({ code: "custom", path: ["palette"], message: copy.ident.validation.keysUnique([...new Set(dupes)].join(", ")) });
    }
    const names = s.palette.map((c) => c.label.toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) {
      ctx.addIssue({ code: "custom", path: ["palette"], message: copy.ident.validation.namesUnique });
    }
    if (s.fallbackPrimary === s.primary) {
      ctx.addIssue({ code: "custom", path: ["fallbackPrimary"], message: copy.ident.validation.fallbackDiffers });
    }
  });

export type PaletteColour = z.infer<typeof PaletteColourSchema>;
export type IdentificationScheme = z.infer<typeof IdentificationSchemeSchema>;
export type IdentificationSchemeInput = z.input<typeof IdentificationSchemeSchema>;

/** Built-in schemes from presets/identification/schemes.json, each with the shared palette attached. */
export function builtInSchemes(): IdentificationScheme[] {
  return schemesFile.schemes.map((s) => IdentificationSchemeSchema.parse({ ...s, palette: schemesFile.palette }));
}

/** The default for a new event: recognise riders by name, because nothing may be assumed to be handed out (docs/06 §0). */
export function defaultScheme(): IdentificationScheme {
  return builtInSchemes().find((s) => s.id === "name-callout") ?? builtInSchemes()[0];
}

/** The scheme chosen when the organiser says riders will wear lycras. */
export function lycraScheme(): IdentificationScheme {
  return builtInSchemes().find((s) => s.id === "vests-per-heat") ?? builtInSchemes()[0];
}

/** Does this scheme rely on lycra colours as its main identifier? */
export function usesLycras(scheme: Pick<IdentificationScheme, "primary">): boolean {
  return scheme.primary === "vest_colour";
}

export function parseIdentificationScheme(json: unknown): IdentificationScheme {
  const r = IdentificationSchemeSchema.safeParse(json);
  if (!r.success) throw new Error(copy.ident.validation.invalid(z.prettifyError(r.error)));
  return r.data;
}

export const IDENTIFIER_LABELS: Record<string, string> = copy.ident.identifiers;
