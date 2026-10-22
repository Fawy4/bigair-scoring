import type { HeatRow, Highlight, Point, RiderReport } from "@/lib/engine/report";
import { copy } from "@/lib/ui-copy";

const R = copy.report;

/** 1 → "1st", 12 → "12th". */
export const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
/** 67 seconds → "1:07". */
export const clock = (sec: number | null): string => (sec === null ? R.heat.noTime : `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`);
/** "Round 3" stays as it is, any other round is "the Final", "the Second chance". */
export const the = (round: string): string => (/^round\b/i.test(round) ? round : `the ${round}`);

type Fmt = Pick<RiderReport, "decimals">;
/** A score or total the way the division shows scores. */
export const score = (r: Fmt, n: number | null | undefined): string => (n === null || n === undefined || Number.isNaN(n) ? "–" : n.toFixed(r.decimals));
/** Rounds half to even (62.5 → 62, 37.5 → 38), the way the reference page rounds its percentages. */
export const roundHalfEven = (x: number): number => {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
};
export const percent = (x: number | null): string => (x === null ? "–" : `${roundHalfEven(x * 100)}%`);
/** A whole-number average of the field ("field 9"). */
export const whole = (x: number | null): string => (x === null ? "–" : String(Math.round(x)));
const side = (r: Pick<RiderReport, "sideWords">, s: "left" | "right" | null | undefined): string => (s === "right" ? r.sideWords.right : r.sideWords.left).toLowerCase();
const otherSide = (r: Pick<RiderReport, "sideWords">, s: "left" | "right" | null | undefined): string => (s === "right" ? r.sideWords.left : r.sideWords.right).toLowerCase();
const rankWord = (n: number): string | null => (n <= 1 ? null : ordinal(n));
const num = (p: Point, i: number): number => p.nums[i] ?? Number.NaN;
const maybe = (x: number): number | null => (Number.isNaN(x) ? null : x);

export function highlightText(h: Highlight, r: RiderReport): string {
  const H = R.highlight;
  switch (h.kind) {
    case "highest_trick":
      return H.highest_trick(h.trick ?? "", score(r, h.value));
    case "best_heat_total":
      return H.best_heat_total(score(r, h.value), h.round ?? "");
    case "longest_winning_run":
      return H.longest_winning_run(h.value ?? 0);
    case "only_rider_to_land":
      return H.only_rider_to_land(h.trick ?? "", score(r, h.value));
    case "most_tricks":
      return H.most_tricks(h.value ?? 0);
    case "most_different_tricks":
      return H.most_different_tricks(h.value ?? 0);
    case "most_loops":
      return H.most_loops(h.value ?? 0);
    case "fewest_crashes":
      return H.fewest_crashes(percent(h.value), h.jumps ?? 0);
    case "best_impression":
      return H.best_impression(r.scoreName, score(r, h.value));
  }
}

export function strengthText(p: Point, r: RiderReport): string {
  const S = R.strength;
  switch (p.code) {
    case "top_trick":
      return S.top_trick(p.trick ?? "", the(p.round ?? ""), score(r, num(p, 0)), rankWord(num(p, 1)));
    case "loops":
      return S.loops(num(p, 0));
    case "growth":
      return S.growth(`${num(p, 0)}%`, the(p.round ?? ""), `${num(p, 1)}%`, the(p.target ?? ""));
    case "landing_rate":
      return S.landing_rate(num(p, 0), num(p, 1), `${num(p, 2)}%`, `${num(p, 3)}%`);
    case "every_attempt":
      return S.every_attempt(num(p, 0), num(p, 1));
    case "impression_above":
      return S.impression_above(r.scoreName, score(r, num(p, 0)), score(r, num(p, 1)));
    case "variety_per_heat":
      return S.variety_per_heat(String(Math.round(num(p, 0) * 10) / 10), String(Math.round(num(p, 1) * 10) / 10));
    case "both_sides":
      return S.both_sides(num(p, 0), p.trick ?? "");
    default:
      return S.totals_growth(score(r, num(p, 0)), score(r, num(p, 1)));
  }
}

/** The sentence of a thing to train: the fact and, where the reference has one, what to do about it. */
export function trainText(p: Point, r: RiderReport): string {
  const T = R.train;
  switch (p.code) {
    case "never_landed":
      return T.never_landed(p.trick ?? "", num(p, 0));
    case "loops_half":
      return T.loops_half(num(p, 0), num(p, 1));
    case "no_loops":
      return T.no_loops(`${num(p, 0)}%`);
    case "one_side":
      return T.one_side(num(p, 0), num(p, 1), side(r, p.side), otherSide(r, p.side));
    case "landed_average_low":
      return T.landed_average_low(score(r, num(p, 0)), score(r, num(p, 1)));
    case "crashed_half":
      return T.crashed_half(p.round ?? "", num(p, 0), num(p, 1));
    case "repeat_same_side":
      return T.repeat_same_side(p.trick ?? "", num(p, 0), side(r, p.side), the(p.round ?? ""));
    default:
      return T.impression_below(r.scoreName, score(r, num(p, 0)), score(r, num(p, 1)));
  }
}

/** The fact behind a thing to train, for the suggested goals. */
export function factText(p: Point, r: RiderReport): string {
  const F = R.fact;
  if (p.code.startsWith("keep_")) return keepText(p, r);
  switch (p.code) {
    case "never_landed":
      return F.never_landed(p.trick ?? "", num(p, 0));
    case "loops_half":
      return F.loops_half(num(p, 0), num(p, 1));
    case "no_loops":
      return F.no_loops;
    case "one_side":
      return F.one_side(num(p, 0), num(p, 1), side(r, p.side));
    case "landed_average_low":
      return F.landed_average_low(score(r, num(p, 0)), score(r, num(p, 1)));
    case "crashed_half":
      return F.crashed_half(p.round ?? "", num(p, 0), num(p, 1));
    case "repeat_same_side":
      return F.repeat_same_side(p.trick ?? "", num(p, 0), side(r, p.side), the(p.round ?? ""));
    default:
      return F.impression_below(r.scoreName, score(r, num(p, 0)), score(r, num(p, 1)));
  }
}

/** A suggested goal that says what to keep doing: the rider's own strength, or the habit of the heats he won. */
export function keepText(p: Point, r: RiderReport): string {
  const K = R.keep;
  switch (p.code.slice("keep_".length)) {
    case "top_trick":
      return K.top_trick(p.trick ?? "", score(r, num(p, 0)));
    case "loops":
      return K.loops(num(p, 0));
    case "growth":
      return K.growth(`${num(p, 0)}%`, `${num(p, 1)}%`);
    case "landing_rate":
      return K.landing_rate(`${num(p, 2)}%`, `${num(p, 3)}%`);
    case "every_attempt":
      return K.every_attempt(num(p, 0), num(p, 1));
    case "impression_above":
      return K.impression_above(r.scoreName, score(r, num(p, 0)), score(r, num(p, 1)));
    case "variety_per_heat":
      return K.variety_per_heat(String(Math.round(num(p, 0) * 10) / 10), String(Math.round(num(p, 1) * 10) / 10));
    case "both_sides":
      return K.both_sides(num(p, 0), p.trick ?? "");
    case "totals_growth":
      return K.totals_growth(score(r, num(p, 0)), score(r, num(p, 1)));
    case "early_banker_all":
      return K.early_banker_all(num(p, 0));
    case "early_banker":
      return K.early_banker(the(p.round ?? ""), clock(num(p, 0)));
    default:
      return K.best_late(the(p.round ?? ""), clock(num(p, 0)));
  }
}

export function strategyText(p: Point, r: RiderReport): string {
  const G = R.strategy;
  const round = the(p.round ?? "");
  switch (p.code) {
    case "gap_out":
      return G.gap_out(round, p.target ? the(p.target) : null, score(r, num(p, 0)), score(r, num(p, 1)), R.replaces(maybe(num(p, 3)), score(r, num(p, 2))));
    case "gap_direct":
      return G.gap_direct(round, p.target ? the(p.target) : null, score(r, num(p, 0)), score(r, num(p, 1)), R.replaces(maybe(num(p, 3)), score(r, num(p, 2))));
    case "gap_place":
      return G.gap_place(round, p.target ?? "", score(r, num(p, 0)), score(r, num(p, 1)), R.replaces(maybe(num(p, 3)), score(r, num(p, 2))));
    case "unused_attempts":
      return G.unused_attempts(round, num(p, 0), num(p, 1));
    case "winner_fewer":
      return G.winner_fewer(round, num(p, 0), num(p, 1));
    case "late_first_trick":
      return G.late_first_trick(round, clock(num(p, 0)));
    case "winner_more_loops":
      return G.winner_more_loops(round, num(p, 0), num(p, 1));
    case "winner_more_tricks":
      return G.winner_more_tricks(round, num(p, 0), num(p, 1));
    case "same_tricks_as_winner":
      return G.same_tricks_as_winner(round, num(p, 0));
    case "early_banker":
      return G.early_banker(round, clock(num(p, 0)));
    default:
      return G.best_late(round, clock(num(p, 0)));
  }
}

/** The result pill of a heat card: "1st — on to Round 3", "2nd — out", "1st — Winner", or the place alone in a final. */
export function heatPill(h: HeatRow): { text: string; win: boolean } {
  if (h.place === null) return { text: R.outcome[h.outcome] ?? "", win: false };
  const p = ordinal(h.place);
  if (h.isFinal) return { text: h.place === 1 ? R.heat.resultWinner(p) : p, win: h.place === 1 };
  if (h.toRound) return { text: R.heat.resultOn(p, the(h.toRound)), win: h.place === 1 };
  return { text: R.heat.resultOut(p), win: false };
}

export function behindText(h: HeatRow, r: Fmt): string | null {
  if (!h.behind) return null;
  const n = score(r, h.behind.gap);
  return h.behind.to === "winner" ? R.heat.behindWinner(n) : R.heat.behindPlace(n, ordinal(h.behind.to));
}

export interface TileView {
  id: string;
  label: string;
  value: string;
  small: string | null;
  sub: string;
  tint: boolean;
}

/** The thirteen tiles as the page shows them, in the reference's order. */
export function tileViews(r: RiderReport): TileView[] {
  const t = r.tiles;
  const T = R.tile;
  const s = (x: number | null) => score(r, x);
  const v = (id: string, label: string, value: string, sub: string, small: string | null = null): TileView => ({ id, label, value, small, sub, tint: false });
  const out: TileView[] = [
    v("jumps", T.jumps, String(t.jumps.value), T.jumpsLine(t.jumps.heats, t.jumps.allowed === null ? null : T.jumpsUsed(t.jumps.value, t.jumps.allowed))),
    v("landed", T.landed, String(t.landed.value), T.landedLine(percent(t.landed.rate), percent(t.landed.fieldRate))),
    v("crashes", T.crashes, String(t.crashes.value), T.crashLine(percent(t.crashes.rate), percent(t.crashes.fieldRate))),
    v("different", T.different, String(t.different.value), T.differentLine(whole(t.different.field))),
    v("loops", T.loops, String(t.loops.landed), T.loopsLine, `/${t.loops.tried}`),
    v("sides", T.sides(r.sideWords.left, r.sideWords.right), `${t.sides.left} · ${t.sides.right}`, T.sidesLine(t.sides.withDirection, t.sides.jumps)),
    v("best-trick", T.bestTrick, s(t.bestTrick.value), T.bestTrickLine(s(t.bestTrick.eventBest))),
    v("average-trick", T.averageTrick, s(t.averageTrick.value), T.averageTrickLine(s(t.averageTrick.field))),
    v("impression", r.scoreName, s(t.impression.value), T.impressionLine(s(t.impression.field))),
    v("won", T.won, String(t.heatsWon.won), T.wonLine(percent(t.heatsWon.share), percent(t.heatsWon.fieldShare)), `/${t.heatsWon.heats}`),
    v("average-total", T.averageTotal, s(t.averageTotal.value), T.averageTotalLine(s(t.averageTotal.field), t.averageTotal.finalists === null ? null : s(t.averageTotal.finalists))),
    v("best-total", T.bestTotal, s(t.bestTotal.value), T.bestTotalLine(t.bestTotal.round, s(t.bestTotal.eventBest))),
    v("steadiness", T.steadiness, t.steadiness.value === null ? "–" : `±${s(t.steadiness.value)}`, t.steadiness.value === null || t.steadiness.min === null || t.steadiness.max === null ? T.steadinessNeeds : T.steadinessLine(s(t.steadiness.min), s(t.steadiness.max), t.steadiness.field === null ? null : s(t.steadiness.field))),
  ];
  return out.map((x, i) => ({ ...x, tint: i >= 6 }));
}

/** "Friday 9 October 2026" for one day, "Thursday 8 – Friday 9 October 2026" for two, in the English of the reference. */
export function dayLine(days: string[]): string | null {
  if (!days.length) return null;
  // written by hand: the browser and the server do not agree on the commas of a formatted date, and a page that differs between them is rebuilt on the client
  const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const fmt = (d: string, withYear: boolean) => {
    const t = new Date(`${d}T12:00:00Z`);
    return `${WEEK[t.getUTCDay()]} ${t.getUTCDate()} ${MONTH[t.getUTCMonth()]}${withYear ? ` ${t.getUTCFullYear()}` : ""}`;
  };
  if (days.length === 1) return fmt(days[0], true);
  return `${fmt(days[0], false)} – ${fmt(days[days.length - 1], true)}`;
}

/** The family name on the trick mix: the scoring's own name for the category, or a plain rendering of its key. */
export const familyName = (r: Pick<RiderReport, "familyLabels">, key: string): string => (key === "not_logged" ? R.notLoggedFamily : (r.familyLabels[key] ?? R.family(key)));
