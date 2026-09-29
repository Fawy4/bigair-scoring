import { z } from "zod";
import schemesFile from "../../../presets/identification/schemes.json";

/**
 * Rider identification scheme (docs/06 §0). One primary identifier shown big on every rider chip, secondary ones small.
 * The palette travels with the scheme, so an event keeps working even if the preset it started from changes later.
 */
export const PaletteColourSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "colour key must be lowercase letters, numbers or _"),
  label: z.string().trim().min(1, "give the colour a name (it is always shown as text too)"),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must look like #e11d48"),
});

export const PrimaryIdentifierSchema = z.enum(["vest_colour", "bib_number", "kite", "rashguard_colour", "helmet_colour", "photo"]);
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
    name: z.string().trim().min(1, "give the scheme a name"),
    description: z.string().optional(),
    primary: PrimaryIdentifierSchema,
    /** Used when the primary identifier is not available on the day (e.g. no vests). */
    fallbackPrimary: PrimaryIdentifierSchema.optional(),
    secondary: z.array(SecondaryIdentifierSchema).default([]),
    vestAssignment: z.enum(["per_heat_slot", "fixed_per_rider", "none"]).default("none"),
    bibNumbering: z.enum(["none", "per_event", "per_division"]).default("none"),
    kiteFields: z.array(z.enum(["brand", "model", "size", "colours"])).default([]),
    /** What the spotter calls out: the colour ("Red"), the number ("14") or the kite ("Blue Orbit"). */
    calloutLabel: z.enum(["colour", "number", "kite"]).default("colour"),
    palette: z.array(PaletteColourSchema).min(1, "the palette needs at least one colour"),
  })
  .superRefine((s, ctx) => {
    const keys = s.palette.map((c) => c.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({ code: "custom", path: ["palette"], message: `colour keys must be unique (duplicate: ${[...new Set(dupes)].join(", ")})` });
    }
    const names = s.palette.map((c) => c.label.toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) {
      ctx.addIssue({ code: "custom", path: ["palette"], message: "two colours share a name; colours are called out by name, so each needs its own" });
    }
    if (s.fallbackPrimary === s.primary) {
      ctx.addIssue({ code: "custom", path: ["fallbackPrimary"], message: "the fallback must differ from the primary identifier" });
    }
  });

export type PaletteColour = z.infer<typeof PaletteColourSchema>;
export type IdentificationScheme = z.infer<typeof IdentificationSchemeSchema>;
export type IdentificationSchemeInput = z.input<typeof IdentificationSchemeSchema>;

/** Built-in schemes from presets/identification/schemes.json, each with the shared palette attached. */
export function builtInSchemes(): IdentificationScheme[] {
  return schemesFile.schemes.map((s) => IdentificationSchemeSchema.parse({ ...s, palette: schemesFile.palette }));
}

/** The default scheme: coloured vests assigned per heat (docs/06 §0). */
export function defaultScheme(): IdentificationScheme {
  return builtInSchemes().find((s) => s.id === "vests-per-heat") ?? builtInSchemes()[0];
}

export function parseIdentificationScheme(json: unknown): IdentificationScheme {
  const r = IdentificationSchemeSchema.safeParse(json);
  if (!r.success) throw new Error(`Invalid identification scheme:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export const IDENTIFIER_LABELS: Record<string, string> = {
  vest_colour: "Vest / lycra colour",
  bib_number: "Bib / sail number",
  kite: "Kite (brand, model, size, colours)",
  kite_size_colour: "Kite size + colourway",
  rashguard_colour: "Rash guard / wetsuit colour",
  helmet_colour: "Helmet colour",
  photo: "Rider photo",
  name: "Name",
  nationality: "Nationality",
  sponsor: "Sponsor",
};
