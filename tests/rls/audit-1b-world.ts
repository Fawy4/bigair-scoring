import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import kota from "../../presets/scoring/kota-best3-impression.json";
import { drawProjection } from "@/lib/draw/projection";
import { expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { publishHeatCore } from "@/lib/live/publish-core";
import { parseFormatTemplate, type FormatTemplate } from "@/lib/schemas/format-template";
import { buildFixture, type Fixture } from "./helpers";
import { ago, codeOf } from "./live-helpers";

/**
 * Audit 1b: the Gouna configuration on the hosted development project, in a throwaway organisation (buildFixture). 24 riders, Knockout, heats of exactly 3,
 * one advances, final of 2, by original seeding (15 heats), KOTA-style scoring with up to 7 attempts, 3 judges + a head judge who also scores (4 panel seats).
 */
export const GOUNA_PARAMS = { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 };

export function gounaTemplate(reseed: "by_original_seed" | "by_heat_score" | "by_place_then_score" = "by_original_seed"): FormatTemplate {
  const j = JSON.parse(readFileSync("presets/formats/heats4-top2-single-elim.json", "utf8"));
  Object.assign(j.generator.params, GOUNA_PARAMS, { reseed });
  return parseFormatTemplate(j);
}

export interface GounaWorld {
  f: Fixture;
  div: string;
  entries: string[];
  draw: DivisionDraw;
  panelSeats: string[];
  head: SupabaseClient;
  heatByUid: (uid: string) => Promise<{ id: string; status: string; number: number; number_suffix: string | null }>;
  uids: string[][];
  seats: (heat: string) => Promise<Array<{ position: number; entry_id: string | null; modifier: string | null; vest_colour: string | null }>>;
  /** Scores and ends a heat: rider i (by slot) gets base[i] on every criterion of one landed attempt and as Impression, from every panel seat; everyone submits. */
  scoreAndEnd: (heat: string, bases?: number[]) => Promise<string[]>;
  publish: (heat: string, reason?: string) => ReturnType<typeof publishHeatCore>;
}

/** A Gouna division in the fixture's published event A1. The other fixture heats that run are ended so one-heat-at-a-time never gets in the way. */
let shared: Promise<Fixture> | null = null;
/** One throwaway fixture per test file (its logins are named after the file's run id, so a second fixture in the same file would collide). */
export const sharedFixture = (): Promise<Fixture> => (shared ??= buildFixture());

export async function buildGouna(o: { reseed?: "by_original_seed" | "by_heat_score" | "by_place_then_score"; riders?: number; fixture?: Fixture; name?: string } = {}): Promise<GounaWorld> {
  const f = o.fixture ?? (await sharedFixture());
  const s = f.s;
  await s.from("heats").update({ status: "ended", ended_at: ago(5) }).in("id", [f.ids.H1, f.ids.H4, f.ids.H5]).in("status", ["running", "paused"]);
  // the head judge also scores
  await s.from("judge_seats").update({ scores: true }).eq("id", f.ids.seat_head);
  const panel = (await s.from("panels").insert({ event_id: f.ids.evA1, name: `Gouna panel ${randomUUID().slice(0, 4)}` }).select("id").single()).data!.id as string;
  const panelSeats = [f.ids.seat_j1, f.ids.seat_j2, f.ids.seat_j3, f.ids.seat_head];
  for (const [i, seat] of panelSeats.entries()) await s.from("panel_members").insert({ panel_id: panel, judge_seat_id: seat, seat_no: i + 1 });
  const model = (await s.from("scoring_models").insert({ organisation_id: f.ids.orgA, key: `gouna-${randomUUID().slice(0, 8)}`, name: "KOTA Gouna", version: 1, json: kota as never, content_hash: randomUUID() }).select("id").single()).data!.id as string;
  const div = (
    await s
      .from("divisions")
      .insert({ event_id: f.ids.evA1, name: o.name ?? "Gouna Pro", sort_order: 60, panel_id: panel, scoring_model_id: model, scoring_overrides: { heat: { maxAttemptsPerRider: 7 } } as never })
      .select("id")
      .single()
  ).data!.id as string;
  const entries: string[] = [];
  const n = o.riders ?? 24;
  const riders = (await s.from("riders").insert(Array.from({ length: n }, (_, i) => ({ organisation_id: f.ids.orgA, first_name: `G${i + 1}`, last_name: "Gouna" }))).select("id, first_name")).data!;
  riders.sort((a, b) => Number(a.first_name.slice(1)) - Number(b.first_name.slice(1)));
  const rows = (await s.from("entries").insert(riders.map((r, i) => ({ division_id: div, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" }))).select("id, seed")).data!;
  rows.sort((a, b) => a.seed - b.seed);
  for (const r of rows) entries.push(r.id);
  const draw = expandFormat(gounaTemplate(o.reseed), entries.map((id, i) => ({ id, name: `G${i + 1}` })), { identification: "vests-per-heat" });
  const saved = await f.clients.orgA.rpc("save_division_draw", { p_division: div, p_draw: draw as never, p_projection: drawProjection(draw) as never, p_action: "generate", p_audit: { after: { summary: "audit 1b" } } as never });
  if (codeOf(saved)) throw new Error(`save draw: ${codeOf(saved)}`);
  const locked = await f.clients.orgA.rpc("lock_division_draw", { p_division: div });
  if (codeOf(locked)) throw new Error(`lock: ${codeOf(locked)}`);
  const uids = draw.rounds.map((r) => r.heats.map((h) => h.uid ?? h.id));

  const heatByUid = async (uid: string) => (await s.from("heats").select("id, status, number, number_suffix").eq("division_id", div).eq("draw_uid", uid).single()).data!;
  const seats = async (heat: string) => (await s.from("heat_slots").select("position, entry_id, modifier, vest_colour").eq("heat_id", heat).order("position")).data ?? [];
  const scoreAndEnd = async (heat: string, bases?: number[]) => {
    const slots = await seats(heat);
    await s.from("heats").update({ status: "ended", started_at: ago(900), ended_at: ago(300) }).eq("id", heat);
    const attempts: object[] = [];
    const riding = slots.filter((sl) => sl.entry_id && sl.modifier !== "DNS");
    for (const sl of riding) attempts.push({ heat_id: heat, entry_id: sl.entry_id, seq: 1, status: "landed", trick_name: "Backroll", client_key: randomUUID() });
    let made: Array<{ id: string; entry_id: string }> = [];
    if (attempts.length) {
      const ins = await s.from("trick_attempts").insert(attempts).select("id, entry_id");
      if (ins.error || !ins.data) throw new Error(`attempts: ${ins.error?.message}`);
      made = ins.data;
    }
    const scores: object[] = [];
    const imps: object[] = [];
    for (const [i, sl] of riding.entries()) {
      const b = (bases?.[slots.indexOf(sl)] ?? 8 - i).toFixed(1);
      const att = made.find((a) => a.entry_id === sl.entry_id)!;
      for (const seat of panelSeats) {
        scores.push({ attempt_id: att.id, judge_seat_id: seat, score: Number(b), criteria: { height: Number(b), extremity: Number(b), technicality: Number(b), execution: Number(b) }, client_key: randomUUID(), client_rev: 1 });
        imps.push({ heat_id: heat, entry_id: sl.entry_id, judge_seat_id: seat, value: Number(b), client_key: randomUUID(), client_rev: 1 });
      }
    }
    if (scores.length) {
      const e1 = await s.from("trick_scores").insert(scores);
      if (e1.error) throw new Error(`scores: ${e1.error.message}`);
      const e2 = await s.from("impression_scores").insert(imps);
      if (e2.error) throw new Error(`impressions: ${e2.error.message}`);
    }
    for (const seat of panelSeats) await s.from("judge_sheets").upsert({ event_id: f.ids.evA1, heat_id: heat, judge_seat_id: seat, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
    return slots.map((sl) => sl.entry_id as string);
  };
  const publish = (heat: string, reason?: string) => publishHeatCore({ user: f.clients.head, service: s }, heat, { overrideReason: reason });
  return { f, div, entries, draw, panelSeats, head: f.clients.head, heatByUid, uids, seats, scoreAndEnd, publish };
}
