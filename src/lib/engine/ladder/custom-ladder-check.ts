// The checker panel of the custom ladder builder (Phase 4b). It re-runs on every change and never blocks editing or saving a draft:
// red faults must be clear before "Apply to draw", amber recommendations never block. Pure.
import {
  advancingPlaces,
  EMPTY,
  heatName,
  ordinal,
  placeKey,
  rankTarget,
  receives,
  roundIndex,
  seatCount,
  seatText,
  setLimits,
  uses,
  type CustomLadder,
  type LadderRound,
  type PlaceRef,
  type SeatRef,
  type SeatSource,
} from "./custom-ladder";

export type FaultCode =
  | "no_rounds"
  | "first_round_seats"
  | "round_receives"
  | "place_twice"
  | "seed_twice"
  | "rider_twice"
  | "seed_unknown"
  | "rider_unknown"
  | "seed_outside_first"
  | "place_unknown"
  | "place_not_advancing"
  | "depends_later"
  | "heat_under_min"
  | "heat_over_max"
  | "final_small"
  | "advance_nowhere"
  | "heat_empty"
  | "seat_empty"
  | "routing_mixed";

export type FixId = "fill_seats" | "add_heats" | "trim_seats" | "allow_size";

export interface Fix {
  id: FixId;
  label: string;
  round?: string;
  /** allow_size: the number of riders per heat to allow in this round. */
  size?: number;
}

export interface Fault {
  code: FaultCode;
  message: string;
  round?: string;
  heat?: number;
  seat?: number;
  fix?: Fix;
}

export type RecommendationCode = "heats_for_field" | "heats_for_arrivals" | "merge_heats" | "second_chance" | "final_of_two" | "eliminates_nobody";

export interface Recommendation {
  code: RecommendationCode;
  message: string;
  round?: string;
  heat?: number;
}

export interface LadderCheck {
  faults: Fault[];
  recommendations: Recommendation[];
  /** No red fault: the ladder can be applied to the draw. */
  complete: boolean;
  /** "Ladder complete — 15 heats, 24 riders, every place accounted for" or how many things are left. */
  status: string;
  heats: number;
  seats: number;
}

export interface RiderRef {
  id: string;
  name: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function limitsOf(l: CustomLadder, round: LadderRound): { min: number; max: number } {
  return { min: round.minHeatSize ?? l.minHeatSize, max: round.maxHeatSize ?? l.maxHeatSize };
}

/** "8 heats of 3", or "6 heats of 3–4" when the field does not split evenly. */
export function describeSplit(n: number, heats: number): string {
  const lo = Math.floor(n / heats);
  const hi = Math.ceil(n / heats);
  return lo === hi ? `${heats} heats of ${lo}` : `${heats} heats of ${lo}–${hi}`;
}

/** Up to two ways to split `n` riders into heats, closest to the division's riders per heat: exact splits first ("8 heats of 3, or 6 of 4"). */
export function suggestSplits(n: number, target: number): Array<{ heats: number; text: string }> {
  if (n < 2) return [];
  const exact: number[] = [];
  for (let size = Math.max(2, target - 1); size <= target + 1; size++) if (n % size === 0 && n / size >= 1 && size <= n) exact.push(size);
  exact.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || b - a);
  const chosen = exact.slice(0, 2).map((s) => n / s);
  if (chosen.length < 2) {
    for (const h of [Math.ceil(n / target), Math.ceil(n / (target + 1))]) {
      if (h >= 1 && !chosen.includes(h) && chosen.length < 2 && Math.ceil(n / h) <= target + 1) chosen.push(h);
    }
  }
  return chosen.sort((a, b) => b - a).map((heats) => ({ heats, text: describeSplit(n, heats) }));
}

/** "8 heats of 3, or 6 of 4" for the field; "4 heats of 2, or 2 heats of 4" for the riders that arrive later. */
const joinSplits = (s: Array<{ text: string }>, short: boolean) => s.map((x, i) => (i === 0 || !short ? x.text : x.text.replace(/^(\d+) heats of /, "$1 of "))).join(", or ");

/** The riders each round needs to seat: the field for Round 1, else what the rounds before it send on. */
export function neededSeats(l: CustomLadder, riders: readonly RiderRef[], roundId: string): number {
  return roundIndex(l, roundId) === 0 ? riders.length : (receives(l).get(roundId) ?? 0);
}

const seatName = (l: CustomLadder, at: SeatRef) => `${seatText(l, at)}`;

export function checkLadder(l: CustomLadder, riders: readonly RiderRef[]): LadderCheck {
  const faults: Fault[] = [];
  const recommendations: Recommendation[] = [];
  const recv = receives(l);
  const last = l.rounds.length - 1;
  const riderIds = new Set(riders.map((r) => r.id));
  const riderName = (id: string) => riders.find((r) => r.id === id)?.name ?? "A rider";

  if (l.rounds.length === 0) {
    faults.push({ code: "no_rounds", message: "Add a round to start the ladder." });
    return { faults, recommendations, complete: false, status: "Add a round to start the ladder.", heats: 0, seats: 0 };
  }

  // ── seats: empty, limits, empty heats
  l.rounds.forEach((round, ri) => {
    const { min, max } = limitsOf(l, round);
    round.heats.forEach((heat, hi) => {
      const name = `${round.shortName} ${heatName(round, hi + 1)}`;
      const empties = heat.seats.filter((s) => s.type === "empty").length;
      if (heat.seats.length === 0 || empties === heat.seats.length) {
        faults.push({
          code: "heat_empty",
          message: `${name} is empty.`,
          round: round.id,
          heat: hi + 1,
          ...(heat.seats.length > 0 ? { fix: { id: "fill_seats" as const, label: "Fill the remaining seats in order", round: round.id } } : {}),
        });
      } else if (empties > 0) {
        faults.push({
          code: "seat_empty",
          message: `${name} has ${plural(empties, "empty seat")}.`,
          round: round.id,
          heat: hi + 1,
          fix: { id: "fill_seats", label: "Fill the remaining seats in order", round: round.id },
        });
      }
      const size = heat.seats.length;
      if (size > 0 && size < min) {
        faults.push({
          code: "heat_under_min",
          message: `${name} has ${plural(size, "seat")}, minimum is ${min}.`,
          round: round.id,
          heat: hi + 1,
          fix: { id: "allow_size", label: `Allow heats of ${size} in ${round.name}`, round: round.id, size },
        });
      }
      if (size > max) {
        faults.push({
          code: "heat_over_max",
          message: `${name} has ${plural(size, "seat")}, maximum is ${max}.`,
          round: round.id,
          heat: hi + 1,
          fix: { id: "allow_size", label: `Allow heats of ${size} in ${round.name}`, round: round.id, size },
        });
      }
      void ri;
    });
  });

  // ── the first round: one seat per rider
  const first = l.rounds[0];
  const firstSeats = seatCount(first);
  if (firstSeats !== riders.length) {
    const diff = Math.abs(firstSeats - riders.length);
    faults.push({
      code: "first_round_seats",
      message:
        firstSeats < riders.length
          ? `${plural(riders.length, "rider")}, ${plural(firstSeats, "seat")} — ${plural(diff, "rider")} ${diff === 1 ? "has" : "have"} no heat.`
          : `${plural(riders.length, "rider")}, ${plural(firstSeats, "seat")} — ${plural(diff, "seat")} ${diff === 1 ? "has" : "have"} no rider.`,
      round: first.id,
      fix: firstSeats < riders.length ? { id: "add_heats", label: "Add the heats this round needs", round: first.id } : { id: "trim_seats", label: "Remove the extra seats", round: first.id },
    });
  }

  // ── later rounds: what arrives against what there is room for
  l.rounds.forEach((round, ri) => {
    if (ri === 0) return;
    const arriving = recv.get(round.id) ?? 0;
    const seats = seatCount(round);
    if (round.heats.length === 0) {
      faults.push({ code: "heat_empty", message: `${round.name} has no heats.`, round: round.id, fix: arriving > 0 ? { id: "add_heats", label: "Add the heats this round needs", round: round.id } : undefined });
      return;
    }
    if (arriving > seats) {
      const d = arriving - seats;
      faults.push({
        code: "round_receives",
        message: `${round.name} receives ${plural(arriving, "rider")} but has ${plural(seats, "seat")} — ${plural(d, "rider")} ${d === 1 ? "has" : "have"} nowhere to go.`,
        round: round.id,
        fix: { id: "add_heats", label: "Add the heats this round needs", round: round.id },
      });
    } else if (arriving < seats) {
      const d = seats - arriving;
      faults.push({
        code: "round_receives",
        message: `${round.name} has ${plural(seats, "seat")} but receives only ${plural(arriving, "rider")} — ${plural(d, "seat")} stay${d === 1 ? "s" : ""} empty.`,
        round: round.id,
        fix: { id: "trim_seats", label: "Remove the extra seats", round: round.id },
      });
    }
  });

  // ── the final
  const fin = l.rounds[last];
  if (seatCount(fin) < 2) faults.push({ code: "final_small", message: `The final has ${plural(seatCount(fin), "seat")} — a final needs at least 2.`, round: fin.id });

  // ── a round whose advancing places go nowhere although it is not the final
  l.rounds.forEach((round, ri) => {
    if (ri < last && round.advance === 0) {
      faults.push({ code: "advance_nowhere", message: `${round.name}'s advancing places go nowhere, although it is not the final. Set how many places go on.`, round: round.id });
    }
  });

  // ── what sits in the seats
  const used = uses(l);
  // places: each can sit in one seat only
  for (const [key, list] of used) {
    if (list.length < 2 || !key.startsWith("p:")) continue;
    const where = list.map((u) => seatName(l, u.at)).join(" and ");
    const [, round, heat, place] = key.split(":");
    const ref: PlaceRef = { round, heat: Number(heat), place: Number(place) };
    const src = l.rounds[roundIndex(l, ref.round)];
    const label = `${ordinal(ref.place)} ${src?.shortName ?? ref.round} ${src ? heatName(src, ref.heat) : `H${ref.heat}`}`;
    faults.push({ code: "place_twice", message: `${label} is used twice (${where}).`, round: list[1].at.round, heat: list[1].at.heat, seat: list[1].at.seat });
  }
  // a seed and a rider named by hand can be the same person
  const people = new Map<string, { at: SeatRef; bySeed: boolean; seed?: number }[]>();
  for (const [key, list] of used) {
    if (key.startsWith("s:")) {
      const seed = Number(key.slice(2));
      const id = riders[seed - 1]?.id;
      if (id) people.set(id, [...(people.get(id) ?? []), ...list.map((u) => ({ at: u.at, bySeed: true, seed }))]);
    } else if (key.startsWith("r:")) {
      const id = key.slice(2);
      people.set(id, [...(people.get(id) ?? []), ...list.map((u) => ({ at: u.at, bySeed: false }))]);
    }
  }
  for (const [id, list] of people) {
    if (list.length < 2) continue;
    const where = list.map((u) => seatName(l, u.at)).join(" and ");
    const at = list[1].at;
    if (list.every((u) => u.bySeed)) faults.push({ code: "seed_twice", message: `Seed ${list[0].seed} is used twice (${where}).`, ...at });
    else faults.push({ code: "rider_twice", message: `${riderName(id)} is used twice (${where}).`, ...at });
  }

  l.rounds.forEach((round, ri) => {
    round.heats.forEach((heat, hi) => {
      heat.seats.forEach((s, si) => {
        const at = { round: round.id, heat: hi + 1, seat: si };
        const name = `${round.shortName} ${heatName(round, hi + 1)}`;
        if (s.type === "seed" || s.type === "rider") {
          if (ri > 0) faults.push({ code: "seed_outside_first", message: `${name} takes a ${s.type === "seed" ? "seed" : "rider"} by hand, but only the first round can.`, ...at });
          else if (s.type === "seed" && s.seed > riders.length) faults.push({ code: "seed_unknown", message: `Seed ${s.seed} does not exist — there ${riders.length === 1 ? "is" : "are"} ${plural(riders.length, "rider")}.`, ...at });
          else if (s.type === "rider" && !riderIds.has(s.entrantId)) faults.push({ code: "rider_unknown", message: `${name} names a rider who is not in this division.`, ...at });
        }
        if (s.type === "place") {
          const si2 = roundIndex(l, s.round);
          const src = l.rounds[si2];
          if (!src) faults.push({ code: "place_unknown", message: `${name} waits for a round that is not in the ladder.`, ...at });
          else if (si2 >= ri) faults.push({ code: "depends_later", message: `${name} waits for ${ordinal(s.place)} of ${src.shortName} ${heatName(src, s.heat)}, which comes after it.`, ...at });
          else if (!src.heats[s.heat - 1] || s.place > src.heats[s.heat - 1].seats.length) faults.push({ code: "place_unknown", message: `${name} waits for ${ordinal(s.place)} of ${src.shortName} H${s.heat}, which does not exist.`, ...at });
          else if (s.place > src.advance) faults.push({ code: "place_not_advancing", message: `${name} uses ${ordinal(s.place)} of ${src.shortName} ${heatName(src, s.heat)}, but only the top ${src.advance} of ${src.name} go on.`, ...at });
        }
      });
    });
  });

  // ── the same rank of a round must go to the same round
  l.rounds.forEach((round, ri) => {
    if (ri === last) return;
    for (let place = 1; place <= round.advance; place++) {
      const targets = new Set<string>();
      for (const r of l.rounds.slice(ri + 1)) for (const h of r.heats) for (const s of h.seats) if (s.type === "place" && s.round === round.id && s.place === place) targets.add(r.id);
      if (targets.size > 1) {
        const names = [...targets].map((id) => l.rounds[roundIndex(l, id)].name).join(" and ");
        faults.push({ code: "routing_mixed", message: `${ordinal(place)} place of ${round.name} goes to ${names}. Every heat of a round must send the same place to the same round.`, round: round.id });
      }
    }
  });

  // ── amber recommendations (never block)
  l.rounds.forEach((round, ri) => {
    const n = ri === 0 ? riders.length : (recv.get(round.id) ?? 0);
    if (ri === 0 || ri < last) {
      const splits = suggestSplits(n, l.targetHeatSize);
      if (splits.length > 0 && !splits.some((s) => s.heats === round.heats.length)) {
        recommendations.push({
          code: ri === 0 ? "heats_for_field" : "heats_for_arrivals",
          message: ri === 0 ? `${n} riders → ${joinSplits(splits, true)}.` : `${n} ${onlyFirsts(l, round.id) ? "winners" : "riders"} arrive in ${round.name} → ${joinSplits(splits, false)}.`,
          round: round.id,
        });
      }
    }
    if (round.heats.length > 1 && round.heats.every((h) => h.seats.length === 1)) {
      recommendations.push({ code: "merge_heats", message: `${round.name} has ${round.heats.length} heats of 1 — merge them?`, round: round.id });
    }
    if (ri < last && round.advance > 0) {
      round.heats.forEach((h, hi) => {
        if (h.seats.length > 0 && round.advance >= h.seats.length) {
          recommendations.push({ code: "eliminates_nobody", message: `${round.shortName} ${heatName(round, hi + 1)} sends everybody on — nobody is out.`, round: round.id, heat: hi + 1 });
        }
      });
    }
  });
  if (l.rounds.length > 1 && seatCount(first) > 0 && first.advance < Math.max(...first.heats.map((h) => h.seats.length))) {
    const anyRunnerUp = l.rounds.slice(1).some((r) => r.heats.some((h) => h.seats.some((s) => s.type === "place" && s.round === first.id && s.place >= 2)));
    if (!anyRunnerUp && l.rounds.length >= 2) {
      recommendations.push({ code: "second_chance", message: `Riders knocked out in ${first.name} ride once — add a second-chance round?`, round: first.id });
    }
  }
  if (seatCount(fin) === 2) recommendations.push({ code: "final_of_two", message: "Final of 2 — a final of 3–4 gives the crowd more.", round: fin.id });

  const heats = l.rounds.reduce((x, r) => x + r.heats.length, 0);
  const seats = l.rounds.reduce((x, r) => x + seatCount(r), 0);
  const complete = faults.length === 0;
  return {
    faults,
    recommendations,
    complete,
    heats,
    seats,
    status: complete ? `Ladder complete — ${plural(heats, "heat")}, ${plural(riders.length, "rider")}, every place accounted for` : `Not complete yet — ${plural(faults.length, "thing")} to fix before the ladder can be applied`,
  };
}

/** True when every rider that arrives in `roundId` came as 1st place of a heat ("8 winners arrive"). */
function onlyFirsts(l: CustomLadder, roundId: string): boolean {
  const at = roundIndex(l, roundId);
  for (const r of l.rounds.slice(0, at)) for (const p of advancingPlaces(l, r.id)) if (rankTarget(l, r.id, p.place) === roundId && p.place !== 1) return false;
  return true;
}

// ── one-tap fixes ──────────────────────────────────────────────────────────────────────

/** Sizes for `missing` more seats: heats of the division's target where possible, the rest spread evenly, every heat within the limits when it can be. */
export function planNewHeats(missing: number, target: number, min: number, max: number): number[] {
  if (missing <= 0) return [];
  let h = Math.max(1, Math.round(missing / target));
  while (Math.ceil(missing / h) > max) h++;
  while (h > 1 && Math.floor(missing / h) < min && Math.floor(missing / (h - 1)) <= max) h--;
  const base = Math.floor(missing / h);
  const extra = missing % h;
  return Array.from({ length: h }, (_, i) => base + (i >= h - extra ? 1 : 0));
}

/** "Fill the remaining seats in order": Round 1 takes the next unused seeds; later rounds take the places sent to them that no seat uses yet (1sts first, then 2nds …). */
export function fillSeats(l: CustomLadder, riders: readonly RiderRef[], roundId?: string): CustomLadder {
  const next = structuredClone(l);
  const targets = roundId ? next.rounds.filter((r) => r.id === roundId) : next.rounds;
  for (const round of targets) {
    const ri = roundIndex(next, round.id);
    const usedKeys = new Set(uses(next).keys());
    let pool: SeatSource[];
    if (ri === 0) {
      pool = riders.map((_, i) => ({ type: "seed" as const, seed: i + 1 })).filter((s) => !usedKeys.has(`s:${s.seed}`));
    } else {
      const arriving: PlaceRef[] = [];
      for (const r of next.rounds.slice(0, ri)) for (const p of advancingPlaces(next, r.id)) if (rankTarget(next, r.id, p.place) === round.id && !usedKeys.has(placeKey(p))) arriving.push(p);
      arriving.sort((a, b) => a.place - b.place || roundIndex(next, a.round) - roundIndex(next, b.round) || a.heat - b.heat);
      pool = arriving.map((p) => ({ type: "place" as const, ...p }));
    }
    let i = 0;
    for (const heat of round.heats) {
      heat.seats = heat.seats.map((s) => (s.type === "empty" && i < pool.length ? pool[i++] : s));
    }
  }
  return next;
}

/** "Add the heats this round needs": enough new (empty) heats to give every arriving rider a seat. */
export function addNeededHeats(l: CustomLadder, riders: readonly RiderRef[], roundId: string): CustomLadder {
  const next = structuredClone(l);
  const round = next.rounds.find((r) => r.id === roundId);
  if (!round) return next;
  const missing = neededSeats(next, riders, roundId) - seatCount(round);
  const { min, max } = limitsOf(next, round);
  for (const size of planNewHeats(missing, next.targetHeatSize, min, max)) round.heats.push({ seats: Array.from({ length: size }, () => EMPTY) });
  return next;
}

/** "Remove the extra seats": empty seats from the end of the round until there are as many seats as riders arriving; heats left with no seats go. */
export function trimSeats(l: CustomLadder, riders: readonly RiderRef[], roundId: string): CustomLadder {
  const next = structuredClone(l);
  const round = next.rounds.find((r) => r.id === roundId);
  if (!round) return next;
  let extra = seatCount(round) - neededSeats(next, riders, roundId);
  for (let hi = round.heats.length - 1; hi >= 0 && extra > 0; hi--) {
    const heat = round.heats[hi];
    for (let si = heat.seats.length - 1; si >= 0 && extra > 0; si--) {
      if (heat.seats[si].type === "empty") {
        heat.seats.splice(si, 1);
        extra--;
      }
    }
  }
  round.heats = round.heats.filter((h) => h.seats.length > 0);
  return next;
}

/** "Allow heats of N in this round": the round's own minimum / maximum, so a 1 v 1 round does not break the division's numbers. */
export function allowSize(l: CustomLadder, roundId: string, size: number): CustomLadder {
  const round = l.rounds.find((r) => r.id === roundId);
  if (!round) return l;
  const { min, max } = limitsOf(l, round);
  return setLimits(l, { ...(size < min ? { minHeatSize: size } : {}), ...(size > max ? { maxHeatSize: size } : {}) }, roundId);
}

export function applyFix(l: CustomLadder, riders: readonly RiderRef[], fix: Fix): CustomLadder {
  switch (fix.id) {
    case "fill_seats":
      return fillSeats(l, riders, fix.round);
    case "add_heats":
      return fix.round ? addNeededHeats(l, riders, fix.round) : l;
    case "trim_seats":
      return fix.round ? trimSeats(l, riders, fix.round) : l;
    case "allow_size":
      return fix.round && fix.size ? allowSize(l, fix.round, fix.size) : l;
  }
}
