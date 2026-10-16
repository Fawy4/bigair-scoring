// The event's own settings built from its description (RB1): the Lycra colour list, the flags, the form the Event step saves. Pure.
import { EventFormSchema, type EventForm } from "@/lib/schemas/event-settings";
import { FlagSettingsSchema, type FlagSettings } from "@/lib/schemas/flags";
import { builtInSchemes, IdentificationSchemeSchema, type IdentificationScheme } from "@/lib/schemas/identification";
import type { EventDescription } from "./schema";

/** "Lycra colour per heat" with the event's colour list: seat 1 takes the first colour, seat 2 the second … for every heat. */
export function lycraSchemeFor(desc: EventDescription): IdentificationScheme {
  const base = builtInSchemes().find((s) => s.id === "vests-per-heat");
  if (!base) throw new Error("The built-in scheme “Lycra colour per heat” is missing.");
  const palette = desc.lycra.map((key) => {
    const colour = base.palette.find((c) => c.key === key);
    if (!colour) throw new Error(`The Lycra colour “${key}” is not in the built-in palette.`);
    return colour;
  });
  return IdentificationSchemeSchema.parse({ ...base, palette });
}

export function flagSettingsFor(desc: EventDescription): FlagSettings {
  return FlagSettingsSchema.parse({ enabled: true, states: desc.flags.states, prestartSec: desc.flags.prestartSec, lastMinuteSec: desc.flags.lastMinuteSec });
}

/** The Event step's form with everything the description decides (the rest keeps the app's defaults). A new event is a draft: not public. */
export function eventFormFor(desc: EventDescription): EventForm {
  const e = desc.event;
  return EventFormSchema.parse({
    name: e.name,
    slug: e.slug,
    location: e.location,
    start_date: e.startDate,
    end_date: e.endDate,
    timezone: e.timezone,
    settings: {
      impressionName: e.impressionName,
      flags: flagSettingsFor(desc),
      identification: { scheme: lycraSchemeFor(desc), basedOn: "vests-per-heat", allowDivisionOverride: false },
    },
    branding: {},
    isSimulation: false,
  });
}

/** "Noah El Dali" → first "Noah", last "El Dali" (the first word is the first name). */
export function splitName(full: string): { first: string; last: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) throw new Error(`“${full}” needs a first and a last name.`);
  return { first: words[0], last: words.slice(1).join(" ") };
}

/** What the organisation's name has to look like to match the description: letters and digits only, so “Redbull” matches “red bull”. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function pickOrganisation<T extends { id: string; name: string; slug: string }>(all: readonly T[], nameContains: string): T {
  const hits = all.filter((o) => squash(o.name).includes(squash(nameContains)) || squash(o.slug).includes(squash(nameContains)));
  if (hits.length === 1) return hits[0];
  const seen = hits.map((o) => `“${o.name}” (${o.slug})`).join(", ");
  throw new Error(hits.length === 0 ? `No organisation has “${nameContains}” in its name.` : `More than one organisation has “${nameContains}” in its name: ${seen}. Nothing was built.`);
}
