import { effectiveScheme } from "@/lib/identification/effective";
import { divisionScheme } from "@/lib/identification/division-scheme";
import { riderLabelModel, type LabelModel } from "@/lib/identification/rider-label";
import { defaultScheme, IdentificationSchemeSchema, type IdentificationScheme } from "@/lib/schemas/identification";
import type { PublicEntry, PublicSite } from "./types";

/** The scheme a division really uses (its own when the event allows it, else the event's, else name call-out): the same rule as every other screen. */
export function schemeFor(site: Pick<PublicSite, "settings" | "divisions">, divisionId: string): IdentificationScheme {
  const ident = site.settings.identification;
  const parsed = ident?.scheme ? IdentificationSchemeSchema.safeParse(ident.scheme) : null;
  const event = { scheme: parsed?.success ? parsed.data : defaultScheme(), allowDivisionOverride: Boolean(ident?.allowDivisionOverride) };
  const own = divisionScheme(site.divisions.find((d) => d.id === divisionId)?.identification);
  return effectiveScheme(event, own ? { scheme: own } : null);
}

export const entryName = (e: Pick<PublicEntry, "first_name" | "last_name"> | undefined): string => `${e?.first_name ?? ""} ${e?.last_name ?? ""}`.trim() || "Rider";

/** The Rider label of one rider in one seat (the Lycra colour is the seat's), with the division's scheme. */
export function labelFor(scheme: IdentificationScheme, entry: PublicEntry | undefined, slotColour: string | null | undefined): LabelModel {
  const rider = {
    name: entryName(entry),
    nationality: entry?.nationality,
    slotColour: slotColour ?? undefined,
    identifiers: (entry?.identifiers ?? undefined) as never,
  };
  const model = riderLabelModel(scheme, rider);
  // a Lycra colour per heat has no colour outside a heat: the label then reads by name instead of "not set"
  return model.primary.kind === "none" ? riderLabelModel(defaultScheme(), rider) : model;
}
