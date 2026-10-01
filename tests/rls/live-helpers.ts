import { randomUUID } from "node:crypto";
import type { Fixture } from "./helpers";

/** Small builders for the live-heat tests: a division with its own panel, riders, round and heats (the shared fixture's heats stay untouched). */
export const codeOf = (r: { error: { message: string } | null }): string => r.error?.message ?? "";

export interface LiveDivision {
  div: string;
  round: string;
  panel: string;
  entries: string[];
}

export async function mkDivision(
  f: Fixture,
  o: { name: string; seats: string[]; locked?: boolean; model?: object; overrides?: object; riders?: number },
): Promise<LiveDivision> {
  const s = f.s;
  const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
    return r.data;
  };
  const panel = must(await s.from("panels").insert({ event_id: f.ids.evA1, name: `P ${o.name}` }).select("id").single(), "panel").id as string;
  let i = 0;
  for (const key of o.seats) must(await s.from("panel_members").insert({ panel_id: panel, judge_seat_id: f.ids[`seat_${key}`], seat_no: ++i }).select("id").single(), "panel member");
  let modelId: string | null = null;
  if (o.model) {
    modelId = must(await s.from("scoring_models").insert({ organisation_id: f.ids.orgA, key: `lv-${randomUUID().slice(0, 8)}`, name: `M ${o.name}`, version: 1, json: o.model as never, content_hash: randomUUID() }).select("id").single(), "model").id as string;
  }
  const div = must(
    await s
      .from("divisions")
      .insert({ event_id: f.ids.evA1, name: o.name, sort_order: 50, panel_id: panel, ...(modelId ? { scoring_model_id: modelId } : { scoring_model_id: f.ids.modelA1 }), ...(o.overrides ? { scoring_overrides: o.overrides as never } : {}) })
      .select("id")
      .single(),
    "division",
  ).id as string;
  if (o.locked !== false) must(await s.from("divisions").update({ draw_locked_at: new Date().toISOString() }).eq("id", div).select("id").single(), "lock");
  const round = must(await s.from("rounds").insert({ division_id: div, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single(), "round").id as string;
  const entries: string[] = [];
  for (let n = 1; n <= (o.riders ?? 3); n++) {
    const rider = must(await s.from("riders").insert({ organisation_id: f.ids.orgA, first_name: `L${n}`, last_name: o.name }).select("id").single(), "rider").id as string;
    entries.push(must(await s.from("entries").insert({ division_id: div, rider_id: rider, seed: n, status: "confirmed", source: "manual" }).select("id").single(), "entry").id as string);
  }
  return { div, round, panel, entries };
}

let heatNumber = 100;
export async function mkHeat(f: Fixture, d: LiveDivision, patch: object = {}, o: { placeholder?: boolean; riders?: number } = {}): Promise<string> {
  const { data, error } = await f.s.from("heats").insert({ round_id: d.round, division_id: d.div, event_id: f.ids.evA1, number: ++heatNumber, duration_sec: 600, ...patch }).select("id").single();
  if (error || !data) throw new Error(`heat: ${error?.message}`);
  const n = o.riders ?? 3;
  for (let p = 1; p <= n; p++) {
    const hole = o.placeholder && p === n;
    const { error: e } = await f.s.from("heat_slots").insert({ heat_id: data.id, position: p, entry_id: hole ? null : d.entries[p - 1], ...(hole ? { source: { from: "1st R1 H1" } } : {}) });
    if (e) throw new Error(`slot: ${e.message}`);
  }
  return data.id as string;
}

export const ago = (sec: number): string => new Date(Date.now() - sec * 1000).toISOString();
export const key = (): string => randomUUID();

export async function heatRow(f: Fixture, id: string) {
  const { data } = await f.s.from("heats").select("status, started_at, paused_at, paused_total_sec, ended_at").eq("id", id).single();
  return data!;
}
