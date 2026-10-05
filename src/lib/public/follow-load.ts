import { isArmedNow, overlayArmedRow } from "@/lib/live/flags";
import { requestOrigin } from "@/lib/platform/origin";
import type { AttemptDisplay } from "@/lib/live/result-shading";
import { buildFollowPages, followPhase, livePages, nextLine, walkKeyOf, type FollowPage, type FollowPhase } from "./follow-model";
import { publicFlagData, type PublicFlagData } from "./flag-data";
import { buildLadder, type LadderRoundVM } from "./ladder-model";
import { liveRows } from "./live-model";
import { loadDraw, loadLive } from "./load";
import { loadCore } from "./page-data";
import { modelOf, type RiderRowVM } from "./results-model";
import { schemeFor } from "./schemes";
import { eventUrl } from "./share";
import type { PublicSite } from "./types";

/** The heat the screen is on while one is armed, running or waiting for the judges: plain values only (they cross to the browser). */
export interface FollowHeat {
  id: string;
  title: string;
  /** The riders in the fewest pages that fit at the TV size (the pages rotate), drawn like the public Live tab: total, formula line and each trick. */
  pages: RiderRowVM[][];
  /** How an attempt chip reads (score alone, number and score, or trick and score): the division's setting, as on the public pages. */
  mode: AttemptDisplay;
  /** Live totals are shown (the event's live-scores switch allows it); otherwise the riders are listed without totals. */
  scoresShown: boolean;
  /** The heat clock's inputs; `status` is "scheduled" while the yellow is up (the clock stands at the full length). */
  clock: { startedAt: string | null; durationSec: number; pausedAt: string | null; pausedTotalSec: number; status: "scheduled" | "running" | "paused" };
}

/** Everything "Big screen — Follow the heat" draws, as one plain answer. The page renders it on the server for the first paint; the browser then asks for it again every second. */
export interface FollowPayload {
  eventName: string;
  logoUrl: string | null;
  timezone: string;
  serverNow: string;
  qrUrl: string;
  defaultMode: "dark" | "day";
  rotateSec: number;
  flag: PublicFlagData | null;
  /** The wind call (red / amber / green with its message) as the public pages have it; null when there is none. Drawn at the very top. */
  wind: PublicSite["wind"];
  phase: FollowPhase;
  heat: FollowHeat | null;
  pages: FollowPage[];
  walkKey: string;
  next: string | null;
}

/**
 * The Follow screen's data, read as a visitor through the same public functions and the same shared 3-second answers as the public pages and the other big screen
 * (loadCore / loadLive / loadDraw): no database path of its own. Unpublished and held results are not in it: the pages are built from released heats only.
 * Null when the event is not public (simulations included, for everyone but their own organiser).
 */
export async function loadFollowPayload(slug: string): Promise<FollowPayload | null> {
  const core = await loadCore(slug);
  if (!core) return null;
  const { site, tt, tabs, results, rules, timetable } = core;
  const nowMs = Date.parse(core.now);
  const phase = followPhase(timetable?.heats ?? [], nowMs);
  // the ladder's draw is asked for at the same time as the live heat (one wait, not two)
  const drawing = loadDraw(site.event.id);

  let heat: FollowHeat | null = null;
  if (phase.kind !== "rotation") {
    const tab = tabs.find((t) => t.id === phase.heatId);
    const row = timetable?.heats.find((h) => h.id === phase.heatId);
    if (tab && row) {
      let riders = tab.riders;
      let scoresShown = false;
      const live = results ? await loadLive(tab.id) : null;
      if (live && results) {
        const model = modelOf(rules, tab.divisionId);
        const rows = liveRows(live, model, new Map(results.entries.map((e) => [e.id, e])), schemeFor(site, tab.divisionId), model?.heat.impression?.label ?? null);
        if (rows) {
          riders = rows;
          scoresShown = true;
        }
      }
      const like = { id: row.id, status: row.status, duration_sec: row.duration_sec, started_at: row.started_at, paused_at: row.paused_at, paused_total_sec: row.paused_total_sec, armed_at: row.armed_at ?? null, prestart_sec: row.prestart_sec ?? null, armed_paused_at: row.armed_paused_at ?? null, time_scale: row.time_scale ?? 1 };
      const played = overlayArmedRow(like, nowMs);
      const status = isArmedNow(like, nowMs) ? "scheduled" : played.status === "paused" ? "paused" : played.status === "running" ? "running" : "scheduled";
      heat = { id: tab.id, title: tab.title, pages: livePages(riders, tab.mode, phase.kind === "reviewing"), mode: tab.mode, scoresShown, clock: { startedAt: played.started_at, durationSec: row.duration_sec, pausedAt: row.paused_at, pausedTotalSec: row.paused_total_sec, status } };
    }
  }

  const draw = await drawing;
  const ladders = new Map<string, LadderRoundVM[]>();
  for (const d of draw?.divisions ?? []) {
    if (!d.draw) continue;
    ladders.set(d.id, buildLadder(d.draw, results?.divisions.find((x) => x.id === d.id), schemeFor(site, d.id), modelOf(rules, d.id)?.panel.decimals ?? 2));
  }
  const divisionNames = new Map((draw?.divisions ?? []).map((d) => [d.id, d.name]));
  const pages = buildFollowPages({ tabs, ladders, nowMs, timezone: site.event.timezone, divisionNames });

  return {
    eventName: site.event.name,
    logoUrl: site.branding.logoUrl ?? site.organisation.logo_url ?? null,
    timezone: site.event.timezone,
    serverNow: core.now,
    qrUrl: eventUrl(await requestOrigin(), site.event.slug),
    defaultMode: site.settings.screenColourMode === "day" ? "day" : "dark",
    rotateSec: site.settings.followRotateSec ?? 15,
    // the "next: …" words are left off the flag pill: the thin line at the bottom says what is next, and the pill stays one short line so the pages keep their room
    flag: ((f) => (f ? { ...f, next: null } : null))(publicFlagData(timetable, tt, site.settings.flags)),
    wind: site.wind,
    phase,
    heat,
    pages,
    walkKey: walkKeyOf(pages),
    next: nextLine(tt.upNext),
  };
}
