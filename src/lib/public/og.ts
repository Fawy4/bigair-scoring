import { copy } from "@/lib/ui-copy";
import { formatEventDates } from "@/lib/platform/event-label";
import type { HeatVM } from "./results-model";
import type { PublicTimetableModel } from "./timetable";
import type { PublicSite } from "./types";

const nameOf = (r: HeatVM["riders"][number]): string => r.label?.secondary.find((x) => x.key === "name")?.text ?? r.label?.primary.text ?? "";

export interface OgText {
  title: string;
  description: string;
  /** Which picture the link preview shows: the event, or one heat's result. */
  image: { kind: "event" } | { kind: "heat"; id: string };
}

/** The last released heat: the one most recently published. */
export const latestComplete = (tabs: HeatVM[]): HeatVM | null =>
  tabs.filter((t) => t.state === "complete" && t.publishedAt).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))[0] ?? null;

/** What WhatsApp shows for the event page: the name, and the heat that is on now, else the latest result, else where and when. Pure. */
export function eventOg(site: PublicSite, tt: PublicTimetableModel, tabs: HeatVM[]): OgText {
  const title = site.event.name;
  if (tt.now) return { title, description: copy.pub.og.liveDescription(tt.now.title), image: { kind: "event" } };
  const last = latestComplete(tabs);
  if (last?.riders[0]) {
    const win = last.riders[0];
    return { title, description: copy.pub.og.resultDescription(last.title, nameOf(win), win.totalLabel ?? ""), image: { kind: "heat", id: last.id } };
  }
  return { title, description: copy.pub.og.eventDescription(site.event.location ?? "", formatEventDates(site.event.start_date, site.event.end_date)), image: { kind: "event" } };
}

/** The text for one heat's page or share. */
export function heatOg(site: PublicSite, heat: HeatVM): OgText {
  const win = heat.state === "complete" ? heat.riders[0] : undefined;
  return {
    title: `${heat.title} · ${site.event.name}`,
    description: win ? copy.pub.og.resultDescription(heat.title, nameOf(win), win.totalLabel ?? "") : copy.pub.og.liveDescription(heat.title),
    image: { kind: "heat", id: heat.id },
  };
}
