import { copy } from "@/lib/ui-copy";

/**
 * The tabs of the public event page, in the order the page shows them. The organiser switches tabs off on the Event step ("Public page"); the Join tab also hides
 * the Join tab is switched like every other one. The big screen is not a tab and is not affected.
 */
export interface PublicTab {
  key: string;
  label: string;
  /** The tab's address below the event's own (empty for Home). */
  path: string;
}

export interface TabSettings {
  leaderboards: Array<{ title: string }>;
  /** The keys the organiser switched off. */
  off: string[];
}

export function publicTabs(leaderboards: Array<{ title: string }>): PublicTab[] {
  const N = copy.pub.nav;
  return [
    { key: "home", label: N.home, path: "" },
    { key: "live", label: N.live, path: "/live" },
    { key: "results", label: N.results, path: "/results" },
    { key: "ladder", label: N.ladder, path: "/ladder" },
    { key: "riders", label: N.riders, path: "/riders" },
    { key: "placings", label: N.placings, path: "/placings" },
    { key: "rules", label: N.rules, path: "/rules" },
    ...leaderboards.map((l, i) => ({ key: `leaderboard-${i + 1}`, label: l.title, path: `/leaderboards/${i + 1}` })),
    { key: "join", label: N.join, path: "/join" },
  ];
}

/** A tab is shown unless the organiser switched it off. Join follows its own switch and nothing else: the officials' PIN entry lives there whether or not riders can register. */
export function isTabVisible(key: string, s: Pick<TabSettings, "off">): boolean {
  return !s.off.includes(key);
}

export function visiblePublicTabs(s: TabSettings): PublicTab[] {
  return publicTabs(s.leaderboards).filter((t) => isTabVisible(t.key, s));
}

/** True when at least one tab stays on (Join counts like any other). */
export function tabsOffLeavesOne(off: string[], leaderboards: Array<{ title: string }>): boolean {
  return publicTabs(leaderboards).some((t) => !off.includes(t.key));
}

/** Where an old link to a hidden tab lands: the first tab that is shown (the event's own address when Home is on). */
export function firstVisibleHref(base: string, s: TabSettings): string {
  const first = visiblePublicTabs(s)[0];
  return first ? `${base}${first.path}` : base;
}
