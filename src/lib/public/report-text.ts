import type { Goal, Highlight, RiderReport, Strategy, Strength, Train, GapLine } from "@/lib/engine/report";
import { copy } from "@/lib/ui-copy";

const R = copy.report;

/** 1 → "1st", 12 → "12th". */
export const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
/** 67 seconds → "1:07". */
export const clock = (sec: number | null): string => (sec === null ? R.heat.noTime : `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`);
/** A score or heat total as the public results show it: two decimals. */
export const score2 = (n: number | null): string => (n === null ? "–" : n.toFixed(2));
/** A distance in points: 0.4, 2.0, 0.43 (one decimal at least, two at most). */
export const points = (n: number): string => (Math.round(n * 100) % 10 === 0 ? n.toFixed(1) : n.toFixed(2));
export const percent = (x: number | null): string => (x === null ? "–" : `${Math.round(x * 100)}%`);
/** Averages and counts of the field: at most one decimal. */
export const avg1 = (x: number | null): string => (x === null ? "–" : String(Math.round(x * 10) / 10));

const sideWord = (r: Pick<RiderReport, "sideWords">, side: "left" | "right" | string | null | undefined): string => (side === "right" ? r.sideWords.right : r.sideWords.left);

export function highlightText(h: Highlight, r: RiderReport): string {
  switch (h.kind) {
    case "highest_trick":
      return R.highlight.highest_trick(score2(h.value), h.trick ?? "");
    case "best_heat_total":
      return R.highlight.best_heat_total(score2(h.value));
    case "longest_winning_run":
      return R.highlight.longest_winning_run(h.value ?? 0);
    case "most_tricks":
      return R.highlight.most_tricks(h.value ?? 0);
    case "most_different_tricks":
      return R.highlight.most_different_tricks(h.value ?? 0);
    case "most_loops":
      return R.highlight.most_loops(h.value ?? 0);
    case "fewest_crashes":
      return R.highlight.fewest_crashes(percent(h.value));
    case "best_impression":
      return R.highlight.best_impression(h.scoreName ?? r.scoreName, score2(h.value));
    case "only_rider_to_land":
      return R.highlight.only_rider_to_land(h.trick ?? "");
  }
}

export function strengthText(s: Strength): string {
  switch (s.code) {
    case "landing_rate":
      return R.strength.landing_rate(s.n, s.m ?? 0);
    case "loops":
      return R.strength.loops(s.n, s.m ?? s.n);
    case "variety_per_heat":
      return R.strength.variety_per_heat(String(s.n), String(s.m ?? 0));
    case "both_sides":
      return R.strength.both_sides(s.n, s.trick ?? "");
    case "growth":
      return R.strength.growth(score2(s.n), score2(s.m));
    case "every_attempt":
      return R.strength.every_attempt(s.n, s.m ?? 1);
  }
}

export function trainText(t: Train, r: Pick<RiderReport, "sideWords">): string {
  switch (t.code) {
    case "never_landed":
      return R.train.never_landed(t.trick ?? "", t.n);
    case "loops_half":
      return R.train.loops_half(t.n, t.m ?? t.n);
    case "no_loops":
      return R.train.no_loops;
    case "one_side":
      return R.train.one_side(sideWord(r, t.side), t.n, t.m ?? 0);
    case "crashed_half":
      return R.train.crashed_half(t.heatLabel ?? "", t.n, t.m ?? t.n);
    case "repeat_same_side":
      return R.train.repeat_same_side(t.trick ?? "", sideWord(r, t.side), t.heatLabel ?? "");
  }
}

export function strategyText(s: Strategy): string {
  switch (s.code) {
    case "unused_attempts":
      return R.strategy.unused_attempts(s.heatLabel, s.n, s.m ?? s.n);
    case "late_first_trick":
      return R.strategy.late_first_trick(s.heatLabel, clock(s.n));
    case "winner_more_loops":
      return R.strategy.winner_more_loops(s.heatLabel, s.n, s.m ?? 0);
    case "winner_more_tricks":
      return R.strategy.winner_more_tricks(s.heatLabel, s.n, s.m ?? 0);
    case "same_tricks_as_winner":
      return R.strategy.same_tricks_as_winner(s.heatLabel, s.n);
    case "early_banker":
      return R.strategy.early_banker(s.heatLabel, clock(s.n));
    case "best_late":
      return R.strategy.best_late(s.heatLabel, clock(s.n));
  }
}

export const gapText = (g: GapLine): string => R.gap(points(g.miss), g.toRound, points(g.needAbove), g.replaces === null ? null : { rank: g.rank ?? 0, score: points(g.replaces) });

/** Goals for next time: the sentence of each goal, in the rider's own words ("Land … on …"), from the takeaways. */
export function goalText(g: Goal, r: RiderReport): string {
  switch (g.from) {
    case "gap":
      return R.goal.gap(points(g.n));
    case "strength":
      return `${R.goal.strength}: ${strengthText({ code: g.code as Strength["code"], n: g.n, m: g.m, trick: g.trick })}`;
    case "train":
      return trainGoal(g, r);
    case "strategy":
      return (R.goals.strategy as Record<string, string>)[g.code] ?? "";
  }
}

function trainGoal(g: Goal, r: Pick<RiderReport, "sideWords">): string {
  switch (g.code) {
    case "never_landed":
      return R.goals.train.never_landed(g.trick ?? "");
    case "loops_half":
      return R.goals.train.loops_half;
    case "no_loops":
      return R.goals.train.no_loops;
    case "one_side": {
      return R.goals.train.one_side(g.side === "right" ? r.sideWords.left : r.sideWords.right);
    }
    case "crashed_half":
      return R.goals.train.crashed_half;
    default:
      return R.goals.train.repeat_same_side(g.trick ?? "", sideWord(r, g.side));
  }
}
