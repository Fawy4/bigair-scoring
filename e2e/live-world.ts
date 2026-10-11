import type { Page } from "@playwright/test";
import { drawProjection } from "../src/lib/draw/projection";
import { applyHeatResult, expandFormat, lockDraw, type DivisionDraw } from "../src/lib/engine/ladder";
import { loadFormat } from "../src/lib/engine/ladder/fixtures";
import { ladderStep } from "../src/lib/live/ladder-step";
import { parseFormatTemplate } from "../src/lib/schemas/format-template";
import { builtInSchemes } from "../src/lib/schemas/identification";
import { createOrganiser } from "./organiser";

/**
 * A throwaway live event for the browser tests (Phase 5b): an organiser, a published event in Cairo with the Lycra-per-heat scheme, one division with the
 * Legacy Variety scoring model (single score in steps of 0.5, 7 attempts a rider, 3 judges; `model: "kota-best3-impression"` scores by criteria), a locked draw with two heats of four riders, a run order for today, and a seat with its own login for
 * three judges, a head judge and a spotter. Everything hangs off one throwaway organisation, which the ledger removes (Arrow, EKL and Demo are never touched).
 */
export type SeatKey = "j1" | "j2" | "j3" | "head" | "spotter" | "spotter2";
const SEATS: Array<[SeatKey, string, "judge" | "head" | "spotter"]> = [
  ["j1", "Judge 1", "judge"],
  ["j2", "Judge 2", "judge"],
  ["j3", "Judge 3", "judge"],
  ["head", "Head judge", "head"],
  ["spotter", "Spotter 1", "spotter"],
  ["spotter2", "Spotter 2", "spotter"],
];
const COLOURS = ["red", "blue", "yellow", "green"];
const NAMES = ["Sam Rivera", "Noor Haddad", "Lena Vogt", "Mia Costa"];

export async function createLiveWorld(opts: { headScores?: boolean; maxRunning?: number; model?: string; flags?: boolean } = {}) {
  const org = await createOrganiser();
  const db = org.db;
  const must = <T extends { id: string }>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
    return r.data;
  };
  const lycra = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

  const event = must(
    await db
      .from("events")
      .insert({
        organisation_id: org.orgId,
        name: `E2E Live ${org.run}`,
        slug: `e2e-live-${org.run}`,
        status: "published",
        timezone: "Africa/Cairo",
        start_date: today,
        end_date: today,
        settings: { publicLiveScores: "live", maxRunningHeats: opts.maxRunning ?? 1, flags: { enabled: opts.flags ?? false }, identification: { scheme: lycra, allowDivisionOverride: false } } as never,
      })
      .select("id")
      .single(),
    "event",
  );
  const { data: model } = await db.from("scoring_models").select("id").is("organisation_id", null).eq("key", opts.model ?? "legacy-kol-best3-variety").order("version", { ascending: false }).limit(1).single();
  const panel = must(await db.from("panels").insert({ event_id: event.id, name: "Panel 1" }).select("id").single(), "panel");
  const division = must(
    await db
      .from("divisions")
      .insert({ event_id: event.id, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id, scoring_overrides: { heat: { maxAttemptsPerRider: 7 } } as never, panel_id: panel.id, draw_locked_at: new Date().toISOString() })
      .select("id")
      .single(),
    "division",
  );
  const round = must(await db.from("rounds").insert({ division_id: division.id, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single(), "round");

  const entries: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [first, ...rest] = NAMES[i].split(" ");
    const rider = must(await db.from("riders").insert({ organisation_id: org.orgId, first_name: first, last_name: rest.join(" "), nationality: "EG" }).select("id").single(), "rider");
    entries.push(must(await db.from("entries").insert({ division_id: division.id, rider_id: rider.id, seed: i + 1, status: "confirmed", source: "manual" }).select("id").single(), "entry").id);
  }
  const heats: string[] = [];
  for (const n of [1, 2]) {
    const heat = must(await db.from("heats").insert({ round_id: round.id, division_id: division.id, event_id: event.id, number: n, duration_sec: 600, warm_up_sec: 0 }).select("id").single(), "heat");
    heats.push(heat.id);
    for (let p = 0; p < 4; p++) await db.from("heat_slots").insert({ heat_id: heat.id, position: p + 1, entry_id: entries[p], vest_colour: COLOURS[p] });
  }
  // today's run order: Heat 1 pinned at 10:00, Heat 2 after it
  const plan = must(
    await db
      .from("schedule_plans")
      .insert({ event_id: event.id, day: today, name: "Main", active: true, items: [{ id: "i1", kind: "heat", heatId: heats[0] }, { id: "i2", kind: "heat", heatId: heats[1] }], anchors: { i1: "10:00" } })
      .select("id")
      .single(),
    "plan",
  );

  const seats = {} as Record<SeatKey, { id: string; email: string; userId: string }>;
  const password = `Pw-${org.run}-live`;
  for (const [key, name, role] of SEATS) {
    const email = `e2e-${org.run}-${key}@example.com`;
    const { data: u, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !u.user) throw new Error(`seat login ${key}: ${error?.message}`);
    org.trackUser(u.user.id);
    const seat = must(await db.from("judge_seats").insert({ event_id: event.id, name, role, scores: role === "judge" || (role === "head" && Boolean(opts.headScores)), auth_user_id: u.user.id, status: "active", active: true }).select("id").single(), `seat ${key}`);
    seats[key] = { id: seat.id, email, userId: u.user.id };
  }
  const panelKeys: SeatKey[] = opts.headScores ? ["j1", "j2", "j3", "head"] : ["j1", "j2", "j3"];
  let n = 0;
  for (const key of panelKeys) await db.from("panel_members").insert({ panel_id: panel.id, judge_seat_id: seats[key].id, seat_no: ++n });

  return {
    org,
    db,
    eventId: event.id,
    orgId: org.orgId,
    panelId: panel.id,
    modelId: model!.id,
    divisionId: division.id,
    heats,
    entries,
    planId: plan.id,
    seats,
    today,
    names: NAMES,
    colours: COLOURS,
    /** Signs the page in as a seat (a real login of its own, through a one-time link) and opens `next`. */
    async signInAs(page: Page, key: SeatKey, next: string) {
      const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: seats[key].email });
      if (error) throw new Error(error.message);
      await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`);
    },
    /** The server starts the heat (service key: the same stamp the head judge's button gives). */
    async startHeat(heat: string) {
      await db.from("heats").update({ status: "running" }).eq("id", heat);
    },
    async cleanup() {
      await org.cleanup();
    },
  };
}
export type LiveWorld = Awaited<ReturnType<typeof createLiveWorld>>;


/**
 * A second division with a real ladder (two heats of three riders, then a Final of two, "By original seeding") saved the way the Draw step saves it: stored draw,
 * rounds, heats with their draw ids and seats. Publishing a heat of Round 1 must put its winner in the Final's seat.
 */
export async function addLadder(w: LiveWorld) {
  const db = w.db;
  const must = <T extends { id: string }>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
    return r.data;
  };
  const division = must(
    await db.from("divisions").insert({ event_id: w.eventId, name: "Ladder", sort_order: 2, scoring_model_id: w.modelId, panel_id: w.panelId, draw_locked_at: new Date().toISOString() }).select("id").single(),
    "ladder division",
  );
  const entries: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < 6; i++) {
    const first = ["Ana", "Ben", "Cy", "Di", "Eli", "Flo"][i];
    const rider = must(await db.from("riders").insert({ organisation_id: w.orgId, first_name: first, last_name: "Ladder", nationality: "EG" }).select("id").single(), "rider");
    entries.push(must(await db.from("entries").insert({ division_id: division.id, rider_id: rider.id, seed: i + 1, status: "confirmed", source: "manual" }).select("id").single(), "entry").id);
    names.push(`${first} Ladder`);
  }
  const template = parseFormatTemplate({
    id: "t", name: "Knockout", entrants: { min: 2, max: null }, timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 }, kind: "generator",
    generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
  });
  const draw = expandFormat(template, entries.map((id, i) => ({ id, name: names[i] })), { identification: "vests-per-heat" });
  await db.from("divisions").update({ draw: draw as never }).eq("id", division.id);
  const projection = drawProjection(draw);
  const roundIds = new Map<string, string>();
  for (const r of projection.rounds) roundIds.set(r.key, must(await db.from("rounds").insert({ division_id: division.id, sort_order: r.sort_order, name: r.name, short_name: r.short_name, spec: r.spec as never }).select("id").single(), "round").id);
  const heats: Record<string, string> = {};
  for (const h of projection.heats) {
    const row = must(
      await db.from("heats").insert({ round_id: roundIds.get(h.round_key)!, division_id: division.id, event_id: w.eventId, number: h.number, draw_uid: h.uid, duration_sec: h.duration_sec, warm_up_sec: 0 }).select("id").single(),
      "ladder heat",
    );
    heats[h.uid] = row.id;
    for (const s of h.slots) await db.from("heat_slots").insert({ heat_id: row.id, position: s.position, entry_id: s.entry_id, vest_colour: s.vest_colour, source: s.source as never });
  }
  return { divisionId: division.id, entries, names, heats, draw };
}

/**
 * Console – Walkover: a division with the real "Knockout with a second chance" ladder for 12 riders (heats of 3), saved the way the Draw step saves it, with a run order
 * for tomorrow (so the estimated times are exact and do not depend on the clock). `stage: "round2"` has Round 1 already published (its winners in Round 3, the others in the
 * second-chance round, which is dealt); `stage: "round1"` has only Heats 2–4 of Round 1 published, Heat 1 waits. Everything hangs off the throwaway organisation.
 */
export async function addSecondChance(w: LiveWorld, stage: "round1" | "round2") {
  const db = w.db;
  const must = <T extends { id: string }>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
    return r.data;
  };
  const division = must(
    await db.from("divisions").insert({ event_id: w.eventId, name: "Second chance", sort_order: 2, scoring_model_id: w.modelId, panel_id: w.panelId, draw_locked_at: new Date().toISOString() }).select("id").single(),
    "second-chance division",
  );
  const first = ["Ana", "Ben", "Cy", "Di", "Eli", "Flo", "Gus", "Hal", "Ida", "Jon", "Kim", "Lou"];
  const entries: string[] = [];
  for (let i = 0; i < 12; i++) {
    const rider = must(await db.from("riders").insert({ organisation_id: w.orgId, first_name: first[i], last_name: "Chance", nationality: "EG" }).select("id").single(), "rider");
    entries.push(must(await db.from("entries").insert({ division_id: division.id, rider_id: rider.id, seed: i + 1, status: "confirmed", source: "manual" }).select("id").single(), "entry").id);
  }
  const template = loadFormat("kota-dingle");
  const draw0 = lockDraw(expandFormat(template, entries.map((id, i) => ({ id, name: `${first[i]} Chance` })), { identification: "vests-per-heat" }));
  // Round 1 as it was ridden: the lower seed wins every heat (the engine fixtures' rule); `stage` decides how much of it has been published
  let draw = draw0;
  const ridden = stage === "round2" ? draw0.rounds[0].heats.map((h) => h.id) : draw0.rounds[0].heats.map((h) => h.id).slice(1);
  for (const id of ridden) draw = publishHeat(draw, id);
  const projection = drawProjection(draw);
  await db.from("divisions").update({ draw: draw as never, draw_at_lock: draw0 as never }).eq("id", division.id);
  const roundIds = new Map<string, string>();
  for (const r of projection.rounds) roundIds.set(r.key, must(await db.from("rounds").insert({ division_id: division.id, sort_order: r.sort_order, name: r.name, short_name: r.short_name, spec: r.spec as never }).select("id").single(), "round").id);
  const heats: Record<string, string> = {};
  const order: string[] = [];
  const published = new Set(ridden.map((id) => draw.rounds.flatMap((r) => r.heats).find((h) => h.id === id)!.uid ?? id));
  const then = new Date(Date.now() - 3_600_000).toISOString();
  for (const h of projection.heats) {
    const isPublished = published.has(h.uid);
    const row = must(
      await db
        .from("heats")
        .insert({ round_id: roundIds.get(h.round_key)!, division_id: division.id, event_id: w.eventId, number: h.number, draw_uid: h.uid, duration_sec: h.duration_sec, warm_up_sec: 0, ...(isPublished ? { status: "published", started_at: then, ended_at: then, published_at: then } : {}) })
        .select("id")
        .single(),
      "second-chance heat",
    );
    heats[h.uid] = row.id;
    order.push(row.id);
    for (const s of h.slots) await db.from("heat_slots").insert({ heat_id: row.id, position: s.position, entry_id: s.entry_id, vest_colour: s.vest_colour, source: s.source as never, modifier: s.modifier });
  }
  // the published heats of Round 1 started and ended an hour ago; a ridden heat has a length, so a walkover (one instant) is told from them
  for (const uid of published) await db.from("heats").update({ ended_at: new Date(Date.now() - 3_000_000).toISOString() }).eq("id", heats[uid]);
  // tomorrow's run order, Heat 1 pinned at 10:00: the times are exact whatever the clock says
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(Date.now() + 86_400_000));
  const unpublished = projection.heats.filter((h) => !published.has(h.uid));
  const items = unpublished.map((h, i) => ({ id: `s${i + 1}`, kind: "heat", heatId: heats[h.uid] }));
  // a published heat's results go public at once only if the event says so (as for any heat): this event does
  const ev = (await db.from("events").select("settings").eq("id", w.eventId).single()).data;
  await db.from("events").update({ settings: { ...((ev?.settings ?? {}) as object), publicResultsOnPublish: true } as never }).eq("id", w.eventId);
  // the console shows one run order (today's, else the nearest day): this one must be it, or the second-chance heats show no times
  await db.from("schedule_plans").update({ active: false }).eq("event_id", w.eventId);
  const plan = must(await db.from("schedule_plans").insert({ event_id: w.eventId, day: tomorrow, name: "Second chance day", active: true, items: items as never, anchors: { s1: "10:00" } }).select("id").single(), "plan");
  const draftRows = await db.from("heats").select("id, number, draw_uid, status").eq("division_id", division.id).order("number");
  return { divisionId: division.id, entries, names: first.map((f) => `${f} Chance`), heats, draw, draw0, planId: plan.id, tomorrow, rows: draftRows.data ?? [] };
}

/** The draw after a heat is published with the lower seed winning (the engine's own rule), for building the stage a browser test starts from. */
function publishHeat(draw: DivisionDraw, heatId: string): DivisionDraw {
  const h = draw.rounds.flatMap((r) => r.heats).find((x) => x.id === heatId)!;
  const ranked = h.slots
    .filter((s) => s.entrantId)
    .map((s, i) => ({ entrantId: s.entrantId as string, place: i + 1, total: 100 - (s.seed ?? i + 1), tieKeys: [] as number[] }))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, place: i + 1 }));
  const out = applyHeatResult(draw, heatId, { ranked });
  if (out.conflict) throw new Error(out.conflict.message);
  return out.draw;
}

/** A heat of the second-chance division finished the way a published normal heat is (service key): used to set up what a browser test then looks at. */
export async function publishDirect(w: LiveWorld, draw: DivisionDraw, heatId: string, uid: string, tieBreak = (seed: number) => 100 - seed) {
  const { data: slots } = await w.db.from("heat_slots").select("entry_id, modifier, position").eq("heat_id", heatId).order("position");
  const drawHeat = draw.rounds.flatMap((r) => r.heats).find((x) => (x.uid ?? x.id) === uid)!;
  const seedOf = (id: string) => draw.seedOrder.indexOf(id) + 1;
  const able = (slots ?? []).filter((s) => s.entry_id && s.modifier !== "DNS").map((s) => ({ entrantId: s.entry_id as string, total: tieBreak(seedOf(s.entry_id as string)) })).sort((a, b) => b.total - a.total);
  const dns = (slots ?? []).filter((s) => s.entry_id && s.modifier === "DNS").map((s) => s.entry_id as string);
  const ranked = [...able.map((r, i) => ({ entrantId: r.entrantId, place: i + 1, total: r.total, tieKeys: [] as number[] })), ...dns.map((id, i) => ({ entrantId: id, place: able.length + i + 1, total: null, modifier: "DNS" as const }))];
  const out = applyHeatResult(draw, drawHeat.id, { ranked });
  if (out.conflict) throw new Error(out.conflict.message);
  const { data: heats } = await w.db.from("heats").select("id, draw_uid, status, started_at").eq("division_id", (await w.db.from("heats").select("division_id").eq("id", heatId).single()).data!.division_id);
  const step = ladderStep(draw, uid, heats ?? [], { ranked });
  if (!step.ok) throw new Error(step.message);
  await w.db.from("heats").update({ status: "ended", started_at: new Date(Date.now() - 900_000).toISOString(), ended_at: new Date(Date.now() - 300_000).toISOString() }).eq("id", heatId);
  const results = ranked.map((r) => ({ entry_id: r.entrantId, place: r.place, total: r.total, percent: null, breakdown: r.total === null ? { status: "DNS" } : { status: "ok", total: r.total, totalLabel: String(r.total), components: { tricks: r.total, impression: 0, bonus: 0, penalty: 0 }, allAttempts: [] } }));
  const { error } = await w.db.rpc("publish_heat_commit", { p_heat: heatId, p_expected_version: 1, p_results: results as never, p_draw: step.draw as never, p_projection: step.projection as never, p_hold: false, p_override_reason: "Set up by the test: no sheets were scored" as never, p_actor: w.seats.head.userId, p_blockers: [] as never });
  if (error) throw new Error(`publish_heat_commit: ${error.message}`);
  return step.draw ?? draw;
}
