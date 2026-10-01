import { parseEventBranding, parseEventSettings, type EventForm } from "./event-settings";
import { defaultScheme } from "./identification";

/** Starting values for a new event; the time zone comes from the organisation (docs/06 §12 decision 18). */
export function blankEventValues(timezone: string): EventForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "",
    slug: "",
    location: "",
    start_date: today,
    end_date: today,
    timezone,
    settings: parseEventSettings({ identification: { scheme: defaultScheme(), basedOn: defaultScheme().id, allowDivisionOverride: false } }),
    branding: parseEventBranding({}),
    isSimulation: false,
  };
}

/** Form values from a saved event row. */
export function valuesFromRow(row: { name: string; slug: string; location: string | null; timezone: string; start_date: string | null; end_date: string | null; settings: unknown; branding: unknown; is_simulation?: boolean | null }): EventForm {
  const today = new Date().toISOString().slice(0, 10);
  const settings = parseEventSettings(row.settings);
  return {
    name: row.name,
    slug: row.slug,
    location: row.location ?? "",
    start_date: row.start_date ?? today,
    end_date: row.end_date ?? row.start_date ?? today,
    timezone: row.timezone,
    settings: { ...settings, identification: settings.identification ?? { scheme: defaultScheme(), basedOn: defaultScheme().id, allowDivisionOverride: false } },
    branding: parseEventBranding(row.branding),
    isSimulation: Boolean(row.is_simulation),
  };
}

