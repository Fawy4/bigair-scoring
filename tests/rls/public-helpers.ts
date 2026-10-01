import { randomUUID } from "node:crypto";
import { drawProjection } from "@/lib/draw/projection";
import { applyHeatResult, expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import type { Fixture } from "./helpers";

/** What the helpers need of a world: a service client and the ids of its organisation, event and a scoring model (the RLS fixture and the browser-test world both fit). */
export type World = { s: Fixture["s"]; ids: Record<string, string> };

const must = (r: { data: unknown; error: { message: string } | null }, what: string): { id: string } => {
  if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
  return r.data as { id: string };
};

export const NAMES = ["Ana Ladder", "Ben Ladder", "Cy Ladder", "Di Ladder", "Eli Ladder", "Flo Ladder"];

export interface Ladder {
  div: string;
  entries: string[];
  names: string[];
  /** draw uid ("R1-H1") → heat row id */
  heats: Record<string, string>;
  draw: DivisionDraw;
}

/**
 * A division with a real ladder, saved the way the Draw step saves it (stored draw, rounds, heats with their draw ids, seats): six riders, two heats of three
 * in Round 1, then a Final of two, "By original seeding" (a published heat fills the Final's seat at once). `locked: false` leaves it a draft.
 */
export async function mkLadder(f: World, o: { name: string; event?: string; locked?: boolean; live?: object; model?: string; reseed?: "by_original_seed" | "by_heat_score" }): Promise<Ladder> {
  const s = f.s;
  const event = o.event ?? f.ids.evA1;
  const div = must(
    await s
      .from("divisions")
      .insert({
        event_id: event,
        name: o.name,
        sort_order: 60,
        scoring_model_id: o.model ?? f.ids.modelA1,
        live_settings: (o.live ?? {}) as never,
        ...(o.locked === false ? {} : { draw_locked_at: new Date().toISOString() }),
      })
      .select("id")
      .single(),
    "division",
  ).id;
  const entries: string[] = [];
  for (let i = 0; i < 6; i++) {
    const [first, last] = NAMES[i].split(" ");
    const rider = must(await s.from("riders").insert({ organisation_id: f.ids.orgA, first_name: first, last_name: `${last}${o.name.replace(/\W/g, "")}`, nationality: "EG" }).select("id").single(), "rider").id;
    entries.push(must(await s.from("entries").insert({ division_id: div, rider_id: rider, seed: i + 1, status: "confirmed", source: "manual" }).select("id").single(), "entry").id);
  }
  const names = NAMES.map((n, i) => `${n.split(" ")[0]} ${n.split(" ")[1]}${o.name.replace(/\W/g, "")}`.trim() || NAMES[i]);
  const template = parseFormatTemplate({
    id: "t",
    name: "Knockout",
    entrants: { min: 2, max: null },
    timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 3 },
    kind: "generator",
    generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: o.reseed ?? "by_original_seed" } },
  });
  const draw = expandFormat(template, entries.map((id, i) => ({ id, name: names[i] })), { identification: "vests-per-heat" });
  await s.from("divisions").update({ draw: draw as never }).eq("id", div);
  const projection = drawProjection(draw);
  const roundIds = new Map<string, string>();
  for (const r of projection.rounds) roundIds.set(r.key, must(await s.from("rounds").insert({ division_id: div, sort_order: r.sort_order, name: r.name, short_name: r.short_name, spec: r.spec as never }).select("id").single(), "round").id);
  const heats: Record<string, string> = {};
  for (const h of projection.heats) {
    const row = must(await s.from("heats").insert({ round_id: roundIds.get(h.round_key)!, division_id: div, event_id: event, number: h.number, draw_uid: h.uid, duration_sec: h.duration_sec, warm_up_sec: 0 }).select("id").single(), "heat").id;
    heats[h.uid] = row;
    for (const sl of h.slots) await s.from("heat_slots").insert({ heat_id: row, position: sl.position, entry_id: sl.entry_id, vest_colour: sl.vest_colour, source: sl.source as never });
  }
  return { div, entries, names, heats, draw };
}

/** What `publish_heat_commit` stores for a rider: the whole breakdown, with the individual judges' marks inside (the public function must remove them). */
export const breakdownOf = (total: number): Record<string, unknown> => ({
  riderId: "x",
  status: "ok",
  total,
  unroundedTotal: total,
  totalLabel: total.toFixed(2),
  percent: 50,
  components: { tricks: total - 5, impression: 5, bonus: 0, penalty: 0 },
  counted: [{ attemptSeq: 1, score: total - 5, categoryKey: null }],
  allAttempts: [
    { seq: 1, status: "landed", trickName: "Backroll", categoryKey: null, score: total - 5, counted: true, repeatIndex: 0, priorCrashesSameTrick: 0, panel: { score: total - 5, unrounded: total - 5, judgeScores: [{ judgeId: "J1", score: 9.9 }, { judgeId: "J2", score: 1.1 }], incomplete: false, missing: ["J3"], missedBy: ["J2"], outlier: true } },
    { seq: 2, status: "crashed", trickName: "Megaloop", categoryKey: null, score: null, counted: false, repeatIndex: 0, priorCrashesSameTrick: 0, panel: null },
  ],
  impression: { score: 5, unrounded: 5, judgeScores: [{ judgeId: "J1", score: 5.5 }], incomplete: false, missing: [], missedBy: [], outlier: false },
  landedCount: 1,
  attemptCount: 2,
  attemptCap: 7,
  interferenceCount: 0,
  flags: { incomplete: false, outliers: [1], extraAttemptsIgnored: false, sensorMissing: [], uncategorised: [] },
  modifiers: [],
});

/**
 * Publishes one heat of a ladder the way the app does it: results (with judge-level marks inside the breakdown), the heat row, the stored draw, and the next
 * round's seat filled at once. `hold: true` leaves it unreleased. Returns the winner's entry id.
 */
export async function publishLadderHeat(f: World, l: Ladder, uid: string, o: { hold?: boolean; draw?: DivisionDraw } = {}): Promise<{ winner: string; draw: DivisionDraw }> {
  const s = f.s;
  const base = o.draw ?? l.draw;
  const drawHeat = base.rounds.flatMap((r) => r.heats).find((h) => (h.uid ?? h.id) === uid)!;
  const riders = drawHeat.slots.flatMap((sl) => (sl.entrantId ? [sl.entrantId] : []));
  const ranked = riders.map((id, i) => ({ entrantId: id, place: i + 1, total: 20 - i, tieKeys: [] }));
  const applied = applyHeatResult(base, drawHeat.id, { ranked });
  if (applied.conflict) throw new Error(applied.conflict.message);
  await s.from("divisions").update({ draw: applied.draw as never }).eq("id", l.div);
  const heat = l.heats[uid];
  const eventId = (await s.from("heats").select("event_id").eq("id", heat).single()).data!.event_id;
  for (const [i, id] of riders.entries()) {
    await s.from("heat_results").insert({ event_id: eventId, heat_id: heat, entry_id: id, place: i + 1, total: 20 - i, percent: 50, breakdown: breakdownOf(20 - i) as never, version: 1 });
  }
  const now = new Date().toISOString();
  await s.from("heats").update({ status: "published", started_at: now, ended_at: now, published_at: now, publish_hold: Boolean(o.hold) }).eq("id", heat);
  // the next seats (fixed fill): every seat whose rider changed
  const after = drawProjection(applied.draw).heats;
  for (const h of after) {
    if (h.uid === uid) continue;
    for (const sl of h.slots) await s.from("heat_slots").update({ entry_id: sl.entry_id }).eq("heat_id", l.heats[h.uid]).eq("position", sl.position);
  }
  return { winner: riders[0], draw: applied.draw };
}

export const newKey = (): string => randomUUID();
