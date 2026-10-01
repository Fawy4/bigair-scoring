import type { HeatResult, RankedResult, RiderResult, TieDecision } from "@/lib/engine/scoring";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { copy, ordinal } from "@/lib/ui-copy";

const T = copy.tie;

export interface TieSentence {
  riderIds: string[];
  text: string;
  unresolved: boolean;
  shared: boolean;
}

/** A score as people say it: at least one decimal, a second only when there is one (8.6, 8.0, 8.25). */
export function shortScore(n: number): string {
  const s = String(Number(n.toFixed(2)));
  return s.includes(".") ? s : `${s}.0`;
}

const list = (names: string[]) => (names.length <= 2 ? names.join(T.and) : `${names.slice(0, -1).join(", ")}${T.and}${names[names.length - 1]}`);

/** The tail a rider is compared on after the best trick: the other counted tricks, then the best uncounted landed ones. */
function nextList(r: RiderResult): number[] {
  const uncounted = r.allAttempts
    .filter((a) => a.status === "landed" && !a.counted && a.score !== null && a.ignored === "not_selected")
    .map((a) => a.score as number)
    .sort((x, y) => y - x);
  return [...r.counted.slice(1).map((c) => c.score), ...uncounted];
}

function whyAhead(model: ScoringModel, by: string, a: RiderResult, b: RiderResult, decisions: TieDecision[]): string {
  switch (by) {
    case "highest_counted_trick":
      return T.bestTrick(shortScore(a.counted[0]?.score ?? 0), shortScore(b.counted[0]?.score ?? 0));
    case "next_counted_trick": {
      const x = nextList(a);
      const y = nextList(b);
      const i = x.findIndex((v, k) => Math.abs(v - (y[k] ?? -Infinity)) > 1e-9);
      return T.nextTrick(shortScore(x[i] ?? 0), shortScore(y[i] ?? 0));
    }
    case "impression":
      return T.impression(model.heat.impression?.label ?? "", shortScore(a.components.impression), shortScore(b.components.impression));
    case "most_landed":
      return T.mostLanded(a.landedCount, b.landedCount);
    case "highest_any_trick": {
      const best = (r: RiderResult) => Math.max(0, ...r.allAttempts.filter((x) => x.status === "landed" && x.ignored !== "over_cap" && x.score !== null).map((x) => x.score as number));
      return T.bestLanded(shortScore(best(a)), shortScore(best(b)));
    }
    case "head_judge": {
      const d = decisions.find((x) => x.riderIds.includes(a.riderId) && x.riderIds.includes(b.riderId));
      return T.headJudge(d?.reason ?? "");
    }
    default:
      return "";
  }
}

/** One sentence for every place where riders have the same total: who is ahead and why, who still has to be chosen, who shares the place. */
export function tieSentences(model: ScoringModel, result: HeatResult, nameOf: (riderId: string) => string, decisions: TieDecision[] = []): TieSentence[] {
  const riding = result.ranking.filter((r) => r.status === "ok" || r.status === "DNF");
  const byId = new Map(result.riders.map((r) => [r.riderId, r]));
  const out: TieSentence[] = [];
  let group: RankedResult[] = [];
  const flush = () => {
    if (group.length > 1) {
      const names = list(group.map((g) => nameOf(g.riderId)));
      out.push({ riderIds: group.map((g) => g.riderId), text: T.unresolved(names), unresolved: true, shared: false });
    }
    group = [];
  };
  for (let i = 1; i < riding.length; i++) {
    const a = riding[i - 1];
    const b = riding[i];
    if (a.total !== b.total) {
      flush();
      continue;
    }
    if (b.tieUnresolved) {
      if (!group.length) group = [a];
      group.push(b);
      continue;
    }
    flush();
    if (b.sharedPlace) {
      out.push({ riderIds: [a.riderId, b.riderId], text: T.shared(list([nameOf(a.riderId), nameOf(b.riderId)]), ordinal(a.place)), unresolved: false, shared: true });
    } else if (b.tieResolvedBy) {
      out.push({ riderIds: [a.riderId, b.riderId], text: T.ahead(nameOf(a.riderId), nameOf(b.riderId), whyAhead(model, b.tieResolvedBy, byId.get(a.riderId)!, byId.get(b.riderId)!, decisions)), unresolved: false, shared: false });
    }
  }
  flush();
  return out;
}
