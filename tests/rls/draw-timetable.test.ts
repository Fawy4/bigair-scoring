import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyDrawEdit, expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { drawProjection } from "@/lib/draw/projection";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";

// Phase 4b: the draw (generate, edit, lock, unlock with a reason), the started-heat rule, the public role not seeing the draw,
// and the run order plans (only the organisation's organisers, one active per day, audited). Each `it` is one plain sentence.
const codeOf = (r: { error: { message: string } | null }): string => r.error?.message ?? "";

describe.skipIf(!ENV_OK)("Draw, lock, run order and plans (hosted development project)", () => {
  let f: Fixture;
  let div: string;
  let entries: string[] = [];
  let other: string; // an entry of another division
  let draw: DivisionDraw;
  const save = (client: SupabaseClient, d: DivisionDraw, action: "generate" | "edit", audit: object = { after: { summary: "test" } }) =>
    client.rpc("save_division_draw", { p_division: div, p_draw: d as never, p_projection: drawProjection(d) as never, p_action: action, p_audit: audit as never });
  const template = () =>
    parseFormatTemplate({
      id: "t",
      name: "Knockout",
      entrants: { min: 2, max: null },
      timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 },
      kind: "generator",
      generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
    });
  const slotsOf = async (heatId: string) => (await f.s.from("heat_slots").select("position, entry_id, modifier").eq("heat_id", heatId).order("position")).data ?? [];
  const heatRows = async () => (await f.s.from("heats").select("id, number, draw_uid, name, status, started_at").eq("division_id", div).order("number")).data ?? [];
  const audit = async (action: string) => (await f.s.from("audit_log").select("action, actor_user_id, before, after, reason").eq("row_id", div).eq("action", action).order("at")).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    div = (await f.s.from("divisions").insert({ event_id: f.ids.evA1, name: `Draw ${f.ids.evA1.slice(0, 4)}`, sort_order: 9 }).select("id").single()).data!.id;
    const riders = [];
    for (let i = 1; i <= 6; i++) riders.push({ organisation_id: f.ids.orgA, first_name: `Dr${i}`, last_name: "Test" });
    const made = (await f.s.from("riders").insert(riders).select("id")).data!;
    entries = (await f.s.from("entries").insert(made.map((r, i) => ({ division_id: div, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" }))).select("id, seed")).data!.sort((a, b) => a.seed - b.seed).map((e) => e.id);
    other = f.ids.e1; // an entry of the fixture's other division
    draw = expandFormat(template(), entries.map((id, i) => ({ id, name: `Rider ${i + 1}` })), { identification: "name-callout" });
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("an organiser of the event saves a generated draw: rounds, heats and seats appear in one go, the draw is stored, and a line is audited", async () => {
    const res = await save(f.clients.orgA, draw, "generate", { after: { summary: "Generated the draw for 6 riders" } });
    expect(codeOf(res)).toBe("");
    const heats = await heatRows();
    expect(heats.length).toBe(draw.rounds.flatMap((r) => r.heats).filter((h) => !h.bye).length);
    expect(heats.every((h) => h.draw_uid)).toBe(true);
    expect((await slotsOf(heats[0].id)).every((s) => s.entry_id)).toBe(true);
    const stored = await f.clients.orgA.from("divisions").select("draw, draw_locked_at, status").eq("id", div).single();
    expect((stored.data!.draw as { rounds: unknown[] }).rounds.length).toBe(draw.rounds.length);
    expect(stored.data!.status).toBe("ready");
    const lines = await audit("draw_generated");
    expect(lines).toHaveLength(1);
    expect(lines[0].actor_user_id).toBe(f.userIds.orgA);
    expect(JSON.stringify(lines[0].after)).toContain("Generated the draw");
  });

  it("nobody else can save a draw: another organisation's organiser, an official and a visitor are all refused", async () => {
    expect(codeOf(await save(f.clients.orgB, draw, "edit"))).toContain("NOT_ALLOWED");
    expect(codeOf(await save(f.clients.j1, draw, "edit"))).toContain("NOT_ALLOWED");
    expect(codeOf(await save(f.clients.head, draw, "edit"))).toContain("NOT_ALLOWED");
    expect(codeOf(await save(f.clients.anon, draw, "edit"))).not.toBe("");
  });

  it("the public role cannot read the stored draw (it names every seat); the organisation's organisers can", async () => {
    expect(codeOf(await f.clients.anon.from("divisions").select("draw").eq("id", div))).not.toBe("");
    expect(codeOf(await f.clients.anon.from("divisions").select("id, name").eq("id", div))).toBe("");
    const own = await f.clients.orgA.from("divisions").select("draw").eq("id", div).single();
    expect(own.data?.draw).toBeTruthy();
  });

  it("a hand edit moves the seats, keeps the heat rows (same ids) and writes an audit line with before and after", async () => {
    const before = await heatRows();
    const moved = applyDrawEdit(draw, { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 0 } });
    const res = await save(f.clients.orgA, moved.draw, "edit", { before: { heat: "Heat 1" }, after: { summary: moved.summary } });
    expect(codeOf(res)).toBe("");
    const after = await heatRows();
    expect(after.map((h) => h.id)).toEqual(before.map((h) => h.id));
    expect((await slotsOf(after[0].id))[0].entry_id).toBe(moved.draw.rounds[0].heats[0].slots[0].entrantId);
    draw = moved.draw;
    const lines = await audit("draw_edited");
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0].after)).toContain("Swapped");
    expect(lines[0].actor_user_id).toBe(f.userIds.orgA);
  });

  it("a heat that is added and another that is taken out keep the others' stored ids; a renumbered heat is still the same heat", async () => {
    const before = await heatRows();
    const added = applyDrawEdit(draw, { op: "addHeat", roundId: "R1" });
    expect(codeOf(await save(f.clients.orgA, added.draw, "edit"))).toBe("");
    const mid = await heatRows();
    expect(mid.length).toBe(before.length + 1);
    // take the first heat out: the others move up a number but keep their rows
    const removed = applyDrawEdit(added.draw, { op: "removeHeat", heatId: "R1-H1" });
    expect(codeOf(await save(f.clients.orgA, removed.draw, "edit"))).toBe("");
    const last = await heatRows();
    expect(last.length).toBe(mid.length - 1);
    const survivors = last.filter((h) => mid.some((m) => m.id === h.id));
    expect(survivors.length).toBe(last.length);
    draw = removed.draw;
  });

  it("a seat naming an entry of another division is refused, and nothing is half-saved", async () => {
    const bad = structuredClone(draw);
    bad.rounds[0].heats[0].slots[0].entrantId = other;
    const before = JSON.stringify(await heatRows());
    expect(codeOf(await save(f.clients.orgA, bad, "edit"))).toContain("BAD_ENTRY");
    expect(JSON.stringify(await heatRows())).toBe(before);
  });

  it("Lock draw freezes it: seat changes, new heats, taken-out heats and a regenerate are all refused; renames still work", async () => {
    expect(codeOf(await f.clients.orgB.rpc("lock_division_draw", { p_division: div }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.orgA.rpc("lock_division_draw", { p_division: div }))).toBe("");
    const locked = await f.clients.orgA.from("divisions").select("draw_locked_at, draw").eq("id", div).single();
    expect(locked.data!.draw_locked_at).not.toBeNull();
    expect((locked.data!.draw as { status: string }).status).toBe("locked");

    const heats = await heatRows();
    const scheduled = heats.find((h) => h.status === "scheduled")!;
    const slots = await slotsOf(scheduled.id);
    // direct changes by the organiser through the tables
    expect(codeOf(await f.clients.orgA.from("heat_slots").update({ entry_id: entries[5] }).eq("heat_id", scheduled.id).eq("position", slots[0].position))).toContain("DRAW_LOCKED");
    expect(codeOf(await f.clients.orgA.from("heat_slots").delete().eq("heat_id", scheduled.id))).toContain("DRAW_LOCKED");
    const round = (await f.s.from("rounds").select("id").eq("division_id", div).limit(1).single()).data!.id;
    expect(codeOf(await f.clients.orgA.from("heats").insert({ round_id: round, division_id: div, event_id: f.ids.evA1, number: 99, duration_sec: 600 }))).toContain("DRAW_LOCKED");
    expect(codeOf(await f.clients.orgA.from("heats").delete().eq("id", scheduled.id))).toContain("DRAW_LOCKED");
    // through the functions
    const moved = applyDrawEdit(draw, { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 1 } });
    expect(codeOf(await save(f.clients.orgA, moved.draw, "edit"))).toContain("DRAW_LOCKED");
    expect(codeOf(await save(f.clients.orgA, draw, "generate"))).toContain("DRAW_LOCKED");
    // the stored draw cannot be overwritten directly either
    expect(codeOf(await f.clients.orgA.from("divisions").update({ draw: null }).eq("id", div))).toContain("DRAW_FUNCTION_ONLY");
    // names are not seats
    expect(codeOf(await f.clients.orgA.from("heats").update({ name: "Opening heat" }).eq("id", scheduled.id))).toBe("");
    expect(codeOf(await f.clients.orgA.from("rounds").update({ name: "Heats" }).eq("id", round))).toBe("");
    expect((await audit("draw_locked")).length).toBe(1);
  });

  it("Unlock needs a written reason and is audited with who and why; nobody else can unlock", async () => {
    expect(codeOf(await f.clients.orgB.rpc("unlock_division_draw", { p_division: div, p_reason: "let me in please" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.orgA.rpc("unlock_division_draw", { p_division: div, p_reason: "" }))).toContain("REASON_REQUIRED");
    expect(codeOf(await f.clients.orgA.rpc("unlock_division_draw", { p_division: div, p_reason: "abc" }))).toContain("REASON_REQUIRED");
    expect(codeOf(await f.clients.orgA.rpc("unlock_division_draw", { p_division: div, p_reason: "Rider 4 was injured, swapping heats" }))).toBe("");
    const lines = await audit("draw_unlocked");
    expect(lines).toHaveLength(1);
    expect(lines[0].reason).toBe("Rider 4 was injured, swapping heats");
    expect(lines[0].actor_user_id).toBe(f.userIds.orgA);
    const now = await f.s.from("divisions").select("draw_locked_at").eq("id", div).single();
    expect(now.data!.draw_locked_at).toBeNull();
    // and editing works again
    const moved = applyDrawEdit(draw, { op: "move", from: { heatId: "R1-H1", slot: 0 }, to: { heatId: "R1-H2", slot: 1 } });
    expect(codeOf(await save(f.clients.orgA, moved.draw, "edit"))).toBe("");
    draw = moved.draw;
  });

  it("a withdrawn rider's seat becomes a walkover even on a locked draw; only the organisation's organisers can do it", async () => {
    await f.clients.orgA.rpc("lock_division_draw", { p_division: div });
    const walk = structuredClone(draw);
    const victim = walk.rounds[0].heats.flatMap((h) => h.slots).find((x) => x.entrantId)!.entrantId!;
    walk.entrants.find((e) => e.id === victim)!.withdrawn = true;
    for (const r of walk.rounds) for (const h of r.heats) for (const s of h.slots) if (s.entrantId === victim) s.modifier = "DNS";
    expect(codeOf(await f.clients.orgB.rpc("set_draw_walkover", { p_division: div, p_entry: victim, p_draw: walk as never }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.orgA.rpc("set_draw_walkover", { p_division: div, p_entry: victim, p_draw: walk as never }))).toBe("");
    const seats = (await f.s.from("heat_slots").select("modifier").eq("entry_id", victim)).data ?? [];
    expect(seats.length).toBeGreaterThan(0);
    expect(seats.every((s) => s.modifier === "DNS")).toBe(true);
    await f.clients.orgA.rpc("unlock_division_draw", { p_division: div, p_reason: "continue the test" });
    draw = walk;
  });

  it("once a heat has started it is never rearranged: seats, numbers and deletion are refused, a rename is allowed, and Generate is refused", async () => {
    const heats = await heatRows();
    const live = heats[0];
    await f.s.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", live.id);
    const slots = await slotsOf(live.id);
    expect(codeOf(await f.clients.orgA.from("heat_slots").update({ entry_id: entries[5] }).eq("heat_id", live.id).eq("position", slots[0].position))).toContain("HEAT_STARTED");
    expect(codeOf(await f.clients.orgA.from("heats").delete().eq("id", live.id))).toContain("HEAT_STARTED");
    expect(codeOf(await f.clients.orgA.from("heats").update({ number: 77 }).eq("id", live.id))).toContain("HEAT_STARTED");
    expect(codeOf(await f.clients.orgA.from("heats").update({ name: "Live heat" }).eq("id", live.id))).toBe("");
    // a regenerate is refused
    expect(codeOf(await save(f.clients.orgA, draw, "generate"))).toContain("HEAT_STARTED");
    // an edit that changes the started heat's seats is refused as a whole
    const liveHeatId = draw.rounds[0].heats.find((h) => h.uid === live.draw_uid)!.id;
    const occupied = draw.rounds[0].heats.find((h) => h.id === liveHeatId)!.slots.findIndex((x) => x.entrantId);
    expect(occupied).toBeGreaterThanOrEqual(0);
    const touched = applyDrawEdit(draw, { op: "clear", heatId: liveHeatId, slot: occupied });
    const before = JSON.stringify(await heatRows());
    expect(codeOf(await save(f.clients.orgA, touched.draw, "edit"))).toContain("HEAT_STARTED");
    expect(JSON.stringify(await heatRows())).toBe(before);
    // an edit of other heats goes through
    const others = applyDrawEdit(draw, { op: "renameHeat", heatId: liveHeatId, name: "Opening" });
    expect(codeOf(await save(f.clients.orgA, others.draw, "edit"))).toBe("");
    expect((await f.s.from("heats").select("name").eq("id", live.id).single()).data!.name).toBe("Opening");
  });

  it("deleting the whole event still works with started heats and a locked draw (nothing in the guards blocks a cascade)", async () => {
    await f.clients.orgA.rpc("lock_division_draw", { p_division: div });
    const ev = (await f.s.from("events").insert({ organisation_id: f.ids.orgA, name: "Throwaway", slug: `rls-tw-${f.ids.evA1.slice(0, 6)}`, status: "draft" }).select("id").single()).data!.id;
    const d2 = (await f.s.from("divisions").insert({ event_id: ev, name: "D", sort_order: 1 }).select("id").single()).data!.id;
    const r2 = (await f.s.from("rounds").insert({ division_id: d2, sort_order: 1, name: "R", short_name: "R", spec: {} }).select("id").single()).data!.id;
    await f.s.from("heats").insert({ round_id: r2, division_id: d2, event_id: ev, number: 1, duration_sec: 600, status: "running", started_at: new Date().toISOString() });
    await f.s.from("divisions").update({ draw_locked_at: new Date().toISOString() }).eq("id", d2);
    const del = await f.clients.orgA.from("events").delete().eq("id", ev);
    expect(codeOf(del)).toBe("");
    expect((await f.s.from("heats").select("id").eq("division_id", d2)).data).toEqual([]);
  });

  // ── run order plans ──
  let planA: string;
  let planB: string;
  const day = "2026-10-10";
  const plan = (event: string, name: string, active = false) => ({ event_id: event, day, name, active, items: [], anchors: {}, actual_starts: {}, defaults: {} });

  it("only the organisation's organisers create, change and delete plans of their event", async () => {
    const a = await f.clients.orgA.from("schedule_plans").insert(plan(f.ids.evA1, "Plan A – Good wind", true)).select("id").single();
    expect(codeOf(a)).toBe("");
    planA = a.data!.id;
    const b = await f.clients.orgA.from("schedule_plans").insert(plan(f.ids.evA1, "Plan B – Bad wind")).select("id").single();
    planB = b.data!.id;
    expect(codeOf(await f.clients.orgB.from("schedule_plans").insert(plan(f.ids.evA1, "Sneaky")))).not.toBe("");
    expect(((await f.clients.orgB.from("schedule_plans").update({ name: "hacked" }).eq("id", planA).select()).data ?? []).length).toBe(0);
    expect(((await f.clients.orgB.from("schedule_plans").delete().eq("id", planB).select()).data ?? []).length).toBe(0);
    expect(((await f.clients.j1.from("schedule_plans").update({ name: "hacked" }).eq("id", planA).select()).data ?? []).length).toBe(0);
    expect((await f.clients.orgA.from("schedule_plans").update({ items: [{ id: "r1", kind: "note", label: "Wind call 09:00" }] as never }).eq("id", planB).select()).data?.length).toBe(1);
  });

  it("Activate switches the day's plan in one step: exactly one is active, a line is audited, and other organisations cannot", async () => {
    expect(codeOf(await f.clients.orgB.rpc("activate_schedule_plan", { p_plan: planB }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.orgA.rpc("activate_schedule_plan", { p_plan: planB }))).toBe("");
    const rows = (await f.s.from("schedule_plans").select("id, active").eq("event_id", f.ids.evA1).eq("day", day)).data ?? [];
    expect(rows.filter((r) => r.active).map((r) => r.id)).toEqual([planB]);
    const lines = (await f.s.from("audit_log").select("action, after, actor_user_id").eq("row_id", planB).eq("action", "plan_activated")).data ?? [];
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0].after)).toContain("Plan B");
  });

  it("two plans cannot both be active on the same day, even by a direct write", async () => {
    const clash = await f.clients.orgA.from("schedule_plans").update({ active: true }).eq("id", planA);
    expect(codeOf(clash)).not.toBe("");
  });

  it("creating and deleting a plan is audited, and the public sees only the active plan of a published event", async () => {
    expect(((await f.clients.anon.from("schedule_plans").select("id, active").eq("event_id", f.ids.evA1)).data ?? []).map((r) => r.id)).toEqual([planB]);
    expect(codeOf(await f.clients.orgA.from("schedule_plans").delete().eq("id", planA))).toBe("");
    const lines = (await f.s.from("audit_log").select("action").eq("row_id", planA)).data ?? [];
    expect(lines.map((l) => l.action).sort()).toEqual(["delete", "insert"]);
  });
});
