import { cache } from "react";
import { loadResults, loadRules, loadSite, loadTimetable } from "./load";
import { buildHeatTabs } from "./results-model";
import { buildPublicTimetable } from "./timetable";

/** Everything most public pages need, read once per request: the site, the timetable for "now", and every heat as a tab. Null when the event is not public. */
export const loadCore = cache(async (slug: string) => {
  const site = await loadSite(slug);
  if (!site) return null;
  const [timetable, results, rules] = await Promise.all([loadTimetable(site.event.id), loadResults(site.event.id), loadRules(site.event.id)]);
  const now = timetable?.server_now ?? new Date().toISOString();
  const tt = buildPublicTimetable(timetable, now);
  const tabs = buildHeatTabs(results, site, rules);
  return { site, timetable, results, rules, tt, tabs, now };
});
