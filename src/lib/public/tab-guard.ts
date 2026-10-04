import { redirect } from "next/navigation";
import { firstVisibleHref, isTabVisible, visiblePublicTabs, type TabSettings } from "./tabs";
import type { PublicSite } from "./types";

export const tabSettingsOf = (site: PublicSite): TabSettings => ({
  leaderboards: site.settings.externalLeaderboards,
  off: site.settings.publicTabsOff ?? [],
});

/** An old link to a tab the organiser switched off lands on the first tab that is shown, never on a "not found". Nothing to land on (no tab shown): the page stays. */
export function guardTab(site: PublicSite, key: string): void {
  const s = tabSettingsOf(site);
  if (isTabVisible(key, s) || visiblePublicTabs(s).length === 0) return;
  redirect(firstVisibleHref(`/e/${site.event.slug}`, s));
}
