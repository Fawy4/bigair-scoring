import { loadCore } from "./page-data";
import { publicFlagData, type PublicFlagData } from "./flag-data";
import type { LabelModel } from "@/lib/identification/rider-label";

/** What the Flag view (the flag marshal's screen) asks for every second. Plain values only. */
export interface FlagViewPayload {
  /** The event's flags are switched on and this is the state input; null when they are off. */
  data: PublicFlagData | null;
  flagsOff: boolean;
  eventName: string;
  /** The heat's riders in seat order, as Rider labels (lycra colours always written out as text too). */
  riders: Array<{ key: string; label: LabelModel | null; text: string }>;
}

/** Everything the Flag view needs, read as a visitor through the public functions (null: the event is not public, simulations included for everyone but their organiser). */
export async function loadFlagView(slug: string): Promise<FlagViewPayload | null> {
  const core = await loadCore(slug);
  if (!core) return null;
  const data = publicFlagData(core.timetable, core.tt, core.site.settings.flags);
  const tab = data?.heatId ? core.tabs.find((t) => t.id === data.heatId) : undefined;
  return {
    data,
    flagsOff: data === null,
    eventName: core.site.event.name,
    riders: (tab?.riders ?? []).map((r, i) => ({ key: r.entryId ?? `seat-${i}`, label: r.label, text: r.placeholder ?? "" })),
  };
}
