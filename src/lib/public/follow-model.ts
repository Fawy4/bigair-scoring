/**
 * "Big screen — Follow the heat": which page the screen is on, and the pages of its Results / Ladder rotation. Pure, no I/O, no Next imports.
 *
 * The screen has three states (followPhase): the live heat from the yellow until the head judge ends it, "Judges reviewing" from End heat until Publish, and the
 * rotation the rest of the time: Results (the newest published heat of today) → Ladder → Results (the one before) → Ladder → … through today's published heats,
 * then round again. Nothing here is ever shrunk to fit: a heat or a ladder that does not fit at the TV size is split across pages (the costs below are in vw, the
 * unit the screen is drawn in, so they hold on any 16:9 screen).
 */
import { overlayArmedRow, isArmedNow } from "@/lib/live/flags";
import { utcToLocalHHMM } from "@/lib/engine/schedule";
import { todayIn } from "@/lib/schedule/plans";
import { boxLabel, type AttemptDisplay } from "@/lib/live/result-shading";
import { copy } from "@/lib/ui-copy";
import type { LadderHeatVM, LadderRoundVM } from "./ladder-model";
import type { BoxVM, HeatVM, RiderRowVM } from "./results-model";
import type { PublicRow } from "./timetable";
import type { TimetableHeat } from "./types";

export type FollowPhase = { kind: "live"; heatId: string } | { kind: "reviewing"; heatId: string } | { kind: "rotation" };

type PhaseHeat = Pick<TimetableHeat, "id" | "status" | "started_at" | "ended_at" | "duration_sec" | "paused_at" | "paused_total_sec"> & Partial<Pick<TimetableHeat, "armed_at" | "prestart_sec" | "armed_paused_at" | "time_scale">>;

const t = (iso: string | null | undefined): number => (iso ? Date.parse(iso) || 0 : 0);

/**
 * The page the screen is on. Live: a heat whose yellow is up, or that is running or paused (by the heat's status, so a clock that has run out still shows live
 * until the head judge presses End heat). Reviewing: the heat that ended last and is not published yet; an older heat that was never published stops counting once
 * a later heat has started (otherwise it would hold the screen all day). Anything else: the rotation. Live always wins over reviewing: arming the next heat takes the
 * screen straight to it.
 */
export function followPhase(heats: PhaseHeat[], nowMs: number): FollowPhase {
  const live = heats.filter((h) => h.status !== "cancelled");
  const armed = live.find((h) => isArmedNow({ id: h.id, status: h.status, duration_sec: h.duration_sec, started_at: h.started_at, paused_at: h.paused_at, paused_total_sec: h.paused_total_sec, armed_at: h.armed_at ?? null, prestart_sec: h.prestart_sec ?? null, armed_paused_at: h.armed_paused_at ?? null, time_scale: h.time_scale ?? 1 }, nowMs));
  if (armed) return { kind: "live", heatId: armed.id };
  const onWater = live.find((h) => {
    const s = overlayArmedRow({ status: h.status, started_at: h.started_at, armed_at: h.armed_at ?? null, prestart_sec: h.prestart_sec ?? null, armed_paused_at: h.armed_paused_at ?? null }, nowMs).status;
    return s === "running" || s === "paused";
  });
  if (onWater) return { kind: "live", heatId: onWater.id };
  const waiting = live.filter((h) => h.status === "ended" || h.status === "under_review");
  const key = (h: PhaseHeat) => t(h.ended_at) || t(h.started_at);
  const last = [...waiting].sort((a, b) => key(b) - key(a))[0];
  if (last && !live.some((h) => t(h.started_at) > t(last.started_at))) return { kind: "reviewing", heatId: last.id };
  return { kind: "rotation" };
}

/** One page of the rotation. */
export type LadderBlock = { name: string; heats: LadderHeatVM[] };
export type FollowPage =
  | { kind: "results"; heatId: string; title: string; publishedAt: string; part: number; parts: number; riders: RiderRowVM[]; mode: AttemptDisplay; countedScores: number[]; divisionId: string }
  | { kind: "ladder"; divisionId: string; title: string; part: number; parts: number; columns: LadderBlock[][] };

/** The height of the page body in vw (the screen is 16:9, so 1920 × 1080 is 100 × 56.25): what the header, title and Next line leave. Rows below are costed in the same unit. */
export const RESULTS_BUDGET_VW = 30.5;
const ROW = { head: 3.8, boxLine: 3.5, formula: 2.1, pad: 0.6, wrapped: 2.8 };
/**
 * How wide one attempt box is at the TV size, in vw, and how wide the line they wrap in is (the page's content width less the indent under the place number). A box is
 * its icon, padding and border plus its text; the text is costed a little wider than it draws, so a row is never costed shorter than it is.
 */
const BOX = { overhead: 3.7, char: 1.05, gap: 0.5, line: 89.5 };

const labelLength = (r: RiderRowVM): number => (r.label ? r.label.primary.text.length + (r.label.secondary.find((x) => x.key === "name")?.text.length ?? 0) : (r.placeholder ?? "").length);

/** How many lines a rider's attempt boxes take at the TV size: the boxes wrap as they are drawn, so "1 · L ×2 BR · 7.33" fits fewer to a line than "1 · 7.33". */
export function boxLineCount(boxes: BoxVM[], mode: AttemptDisplay): number {
  let lines = 0;
  let used = 0;
  for (const b of boxes) {
    const w = Math.min(BOX.overhead + boxLabel(b, mode).length * BOX.char, BOX.line);
    if (lines === 0) {
      lines = 1;
      used = w;
    } else if (used + BOX.gap + w > BOX.line) {
      lines++;
      used = w;
    } else used += BOX.gap + w;
  }
  return lines;
}

/** The room one rider's row takes on a Results page, in vw. */
export function riderCost(r: RiderRowVM, mode: AttemptDisplay): number {
  return ROW.head + (labelLength(r) > 26 ? ROW.wrapped : 0) + boxLineCount(r.boxes, mode) * ROW.boxLine + (r.formula ? ROW.formula : 0) + ROW.pad;
}

/** A heat's riders in the fewest pages that fit at the TV size, balanced (5 riders that need two pages are 3 + 2, not 4 + 1). Never empty: a heat without riders is one empty page. */
export function paginateResults(riders: RiderRowVM[], mode: AttemptDisplay, budget = RESULTS_BUDGET_VW): RiderRowVM[][] {
  if (!riders.length) return [[]];
  const fits = (rows: RiderRowVM[]) => rows.reduce((n, r) => n + riderCost(r, mode), 0) <= budget;
  // how many pages: the least that lets the riders be dealt out in order, each page within the budget
  const greedy = (): number => {
    let pages = 1;
    let used = 0;
    for (const r of riders) {
      const c = riderCost(r, mode);
      if (used + c > budget && used > 0) {
        pages++;
        used = 0;
      }
      used += c;
    }
    return pages;
  };
  const pages = greedy();
  if (pages === 1) return [riders];
  // balance: the same number of pages, with the riders spread evenly (by count) while every page still fits; otherwise the greedy split
  const size = Math.ceil(riders.length / pages);
  const even: RiderRowVM[][] = [];
  for (let i = 0; i < riders.length; i += size) even.push(riders.slice(i, i + size));
  if (even.length === pages && even.every(fits)) return even;
  const out: RiderRowVM[][] = [];
  let cur: RiderRowVM[] = [];
  let used = 0;
  for (const r of riders) {
    const c = riderCost(r, mode);
    if (used + c > budget && cur.length) {
      out.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(r);
    used += c;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * How many whole rows go on each page, from the rows' real positions on the screen (px from the top of the rows' box) and the room under the top of that box. A row
 * never ends up half on a page: when the next row would reach past the room it starts the next page. Every page has at least one row (a row taller than the room gets a
 * page of its own). The estimate above only decides the first split; this is what the screen measures, so a wind banner, a flag, a long name or a long title that take
 * room cannot push a row off the bottom.
 */
export function chunkByHeight(tops: number[], bottoms: number[], room: number): number[] {
  const sizes: number[] = [];
  let start = 0;
  for (let i = 0; i < tops.length; i++) {
    if (i > start && bottoms[i] - tops[start] > room) {
      sizes.push(i - start);
      start = i;
    }
  }
  if (tops.length > start) sizes.push(tops.length - start);
  return sizes;
}

/** Splits rows by the sizes `chunkByHeight` gave; sizes that do not add up to the rows give one page (the rows changed since they were measured). */
export function splitBySizes<T>(rows: T[], sizes: number[] | undefined): T[][] {
  if (!rows.length || !sizes || sizes.reduce((a, b) => a + b, 0) !== rows.length || sizes.some((n) => n < 1)) return [rows];
  const out: T[][] = [];
  let at = 0;
  for (const n of sizes) {
    out.push(rows.slice(at, at + n));
    at += n;
  }
  return out;
}

/** What a measurement belongs to: the page and its riders with their attempt counts, so it is made again whenever the page's content changes. */
export const riderSignature = (key: string, riders: RiderRowVM[]): string => `${key}:${riders.map((r) => `${r.entryId ?? "seat"}/${r.boxes.length}/${r.totalLabel ?? ""}`).join("|")}`;

/** The "Judges reviewing" banner takes this much of the page body, in vw. */
export const REVIEW_BANNER_VW = 9;

/** The live heat's riders in pages: the same costing as a Results page, with the banner's room taken off while the judges review. Never shrunk. */
export function livePages(riders: RiderRowVM[], mode: AttemptDisplay, reviewing: boolean): RiderRowVM[][] {
  return paginateResults(riders, mode, RESULTS_BUDGET_VW - (reviewing ? REVIEW_BANNER_VW : 0));
}

/** Rows of a ladder column at the TV size (a heat card is a header row plus a row per rider, a round name is one row). */
export const LADDER_COLUMN_ROWS = 9;
export const LADDER_COLUMNS = 2;
const heatRows = (h: LadderHeatVM): number => 1 + h.riders.reduce((n, r) => n + (r.name.length > 24 ? 2 : 1), 0);

/**
 * A ladder in pages, round by round: heats are dealt into two columns, in order, and a heat card is never split; a round that runs on into the next column or page
 * keeps its name above its next piece. Every heat appears exactly once. Pure.
 */
export function paginateLadder(rounds: LadderRoundVM[]): LadderBlock[][][] {
  const pages: LadderBlock[][][] = [];
  let columns: LadderBlock[][] = [];
  let column: LadderBlock[] = [];
  let used = 0;
  const closeColumn = () => {
    if (column.length) columns.push(column);
    column = [];
    used = 0;
    if (columns.length === LADDER_COLUMNS) {
      pages.push(columns);
      columns = [];
    }
  };
  for (const round of rounds) {
    let block: LadderBlock | null = null;
    for (const heat of round.heats) {
      const need = heatRows(heat) + (block ? 0 : 1);
      if (used + need > LADDER_COLUMN_ROWS && used > 0) {
        closeColumn();
        block = null;
      }
      if (!block) {
        block = { name: round.name, heats: [] };
        column.push(block);
        used += 1;
      }
      block.heats.push(heat);
      used += heatRows(heat);
    }
  }
  closeColumn();
  if (columns.length) pages.push(columns);
  return pages;
}

export interface FollowPagesInput {
  tabs: HeatVM[];
  /** The ladder of each division that has one, winners already moved into their next seats (the same model as the public ladder page). */
  ladders: Map<string, LadderRoundVM[]>;
  nowMs: number;
  timezone: string;
  /** Names for the ladder pages when no result has been published today. */
  divisionNames?: Map<string, string>;
}

const ladderPages = (divisionId: string, name: string, rounds: LadderRoundVM[] | undefined): FollowPage[] => {
  const pages = rounds?.length ? paginateLadder(rounds) : [];
  return pages.map((columns, i) => ({ kind: "ladder" as const, divisionId, title: name, part: i + 1, parts: pages.length, columns }));
};

/**
 * The rotation. Results of today's published heats, newest first (only a complete heat that is released: a live, scheduled or held heat is never in `tabs` as
 * complete, so nothing unpublished or held can get in), each followed by the ladder of its division. With nothing published today the ladders alone, one division
 * after the other; with nothing at all, no pages.
 */
export function buildFollowPages(i: FollowPagesInput): FollowPage[] {
  const today = todayIn(i.timezone, i.nowMs);
  const published = i.tabs
    .filter((x) => x.state === "complete" && x.publishedAt && todayIn(i.timezone, Date.parse(x.publishedAt)) === today)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
  const names = new Map<string, string>(i.divisionNames ?? []);
  for (const x of i.tabs) names.set(x.divisionId, x.divisionName);
  if (!published.length) return [...i.ladders.keys()].flatMap((d) => ladderPages(d, names.get(d) ?? "", i.ladders.get(d)));
  return published.flatMap((h): FollowPage[] => {
    const chunks = paginateResults(h.riders, h.mode);
    const at = utcToLocalHHMM(h.publishedAt!, i.timezone);
    const results = chunks.map((riders, k): FollowPage => ({ kind: "results", heatId: h.id, title: h.title, publishedAt: at, part: k + 1, parts: chunks.length, riders, mode: h.mode, countedScores: h.countedScores, divisionId: h.divisionId }));
    return [...results, ...ladderPages(h.divisionId, h.divisionName, i.ladders.get(h.divisionId))];
  });
}

/** What the walk is anchored to: the newest page's heat. A new publish changes it, and the rotator then starts again from the first page. */
export const walkKeyOf = (pages: FollowPage[]): string => {
  const first = pages[0];
  if (!first) return "";
  return first.kind === "results" ? `r:${first.heatId}` : `l:${first.divisionId}`;
};

/** "Next: Pro Men · R1 · Heat 7 · est. 14:40" from the run order (one line, no extra page). A fixed time is not called an estimate; on a hold there is no time. */
export function nextLine(upNext: PublicRow[]): string | null {
  const n = upNext[0];
  if (!n) return null;
  return copy.pub.follow.next(n.title, n.start ? (n.estimated ? copy.pub.follow.est(n.start) : n.start) : null);
}
