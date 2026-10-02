import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import legacy from "../../presets/scoring/legacy-kol-best3-variety.json";
import { drawProjection } from "@/lib/draw/projection";
import { expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { publishHeatCore } from "@/lib/live/publish-core";
import { insertRerunItem, rerunName } from "@/lib/live/rerun";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision } from "./live-helpers";

// Phase 5c "Re-run heat": cancel a heat and create its re-run (3R) with the same riders, seats and Lycras; later seats follow it; the draw stays locked and
// unchanged; riders left out are ranked last (DSQ below DNS). docs/08 §1H-10.
describe.skipIf(!ENV_OK)("Re-run heat (hosted development project)", () => {
  let f: Fixture;
  let div: string;
  let entries: string[];
  let draw: DivisionDraw;
  let planId: string;
  const heatUid = (uid: string) => f.s.from("heats").select("id, status, number, number_suffix, name, draw_uid, rerun_of, started_at, ended_at, duration_sec, warm_up_sec").eq("division_id", div).eq("draw_uid", uid).maybeSingle();
  const heatsOf = async () => (await f.s.from("heats").select("id, status, number, number_suffix, draw_uid, rerun_of").eq("division_id", div).order("number").order("number_suffix")).data ?? [];
  const slotsOf = async (heat: string) => (await f.s.from("heat_slots").select("position, entry_id, vest_colour, modifier, source, flagged_out").eq("heat_id", heat).order("position")).data ?? [];
  const names = (heat: { number: number; number_suffix: string | null; name: string | null }) => rerunName({ number: heat.number, suffix: heat.number_suffix, name: heat.name });
  const run = (client: SupabaseClient, original: string, newId: string, reason: string, leaveOut: Record<string, string> = {}, plan: { id: string; items: unknown; updatedAt: string } | null = null) => {
    return f.s
      .from("heats")
      .select("number, number_suffix, name")
      .eq("id", original)
      .single()
      .then(({ data }) => {
        const n = names(data!);
        return client.rpc("rerun_heat", { p_heat: original, p_new_heat: newId, p_suffix: n.suffix, p_name: n.name, p_reason: reason, p_leave_out: leaveOut as never, p_plan: (plan?.id ?? null) as never, p_plan_items: (plan?.items ?? null) as never, p_plan_updated_at: (plan?.updatedAt ?? null) as never });
      });
  };
  const audit = async (action: string) => (await f.s.from("audit_log").select("action, reason, before, after, actor_user_id").eq("event_id", f.ids.evA1).eq("action", action)).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    const made = await mkDivision(f, { name: "RerunDiv", seats: ["j1", "j2", "j3"], model: legacy, riders: 6, locked: false });
    div = made.div;
    entries = made.entries;
    await f.s.from("rounds").delete().eq("division_id", div);
    const template = parseFormatTemplate({
      id: "t", name: "Knockout", entrants: { min: 2, max: null }, timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 }, kind: "generator",
      generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
    });
    draw = expandFormat(template, entries.map((id, i) => ({ id, name: `Rider ${i + 1}` })), { identification: "vests-per-heat" });
    expect(codeOf(await f.clients.orgA.rpc("save_division_draw", { p_division: div, p_draw: draw as never, p_projection: drawProjection(draw) as never, p_action: "generate", p_audit: { after: { summary: "test" } } as never }))).toBe("");
    expect(codeOf(await f.clients.orgA.rpc("lock_division_draw", { p_division: div }))).toBe("");
    // the run order: the three heats of the division
    const ids = (await heatsOf()).map((h) => h.id);
    const plan = (await f.s.from("schedule_plans").insert({ event_id: f.ids.evA1, day: "2026-10-10", name: "Rerun plan", active: false, items: ids.map((id) => ({ id: `i-${id}`, kind: "heat", heatId: id })), anchors: {} }).select("id").single()).data!;
    planId = plan.id;
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("a running heat is cancelled and its re-run created with the same riders, seats and Lycra colours; the later seat follows it; the draw is unchanged; one audit line", async () => {
    const orig = (await heatUid("R1-H1")).data!;
    await f.s.from("heats").update({ status: "running", started_at: ago(200) }).eq("id", orig.id);
    // an attempt and a score stay stored for the audit
    const att = (await f.s.from("trick_attempts").insert({ heat_id: orig.id, entry_id: entries[0], seq: 1, status: "landed", trick_name: "Backroll", client_key: key() }).select("id").single()).data!;
    await f.s.from("trick_scores").insert({ attempt_id: att.id, judge_seat_id: f.ids.seat_j1, score: 7, client_key: key(), client_rev: 1 });
    const drawBefore = (await f.s.from("divisions").select("draw, draw_locked_at").eq("id", div).single()).data!;
    const slotsBefore = await slotsOf(orig.id);
    const newId = randomUUID();

    const res = await run(f.clients.head, orig.id, newId, "kite tangle");
    expect(codeOf(res)).toBe("");
    const cancelled = (await f.s.from("heats").select("status, started_at, ended_at, draw_uid").eq("id", orig.id).single()).data!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.started_at).not.toBeNull();
    expect(cancelled.ended_at).not.toBeNull(); // the timetable knows how long it really ran
    expect(cancelled.draw_uid).toBeNull();
    const rerun = (await f.s.from("heats").select("id, status, number, number_suffix, name, draw_uid, rerun_of, duration_sec, warm_up_sec").eq("id", newId).single()).data!;
    expect(rerun).toMatchObject({ status: "scheduled", number: orig.number, number_suffix: "R", name: "Heat 1 re-run", draw_uid: "R1-H1", rerun_of: orig.id, duration_sec: orig.duration_sec, warm_up_sec: orig.warm_up_sec });
    expect(await slotsOf(newId)).toEqual(slotsBefore.map((s) => ({ ...s, flagged_out: false })));
    // the original's attempts and scores are still stored and readable by the head judge
    expect(((await f.clients.head.from("trick_attempts").select("id").eq("heat_id", orig.id)).data ?? []).length).toBe(1);
    expect(((await f.clients.head.from("trick_scores").select("id").eq("attempt_id", att.id)).data ?? []).length).toBe(1);
    // the draw is untouched and still locked
    const drawAfter = (await f.s.from("divisions").select("draw, draw_locked_at").eq("id", div).single()).data!;
    expect(drawAfter).toEqual(drawBefore);
    expect(drawAfter.draw_locked_at).not.toBeNull();
    // exactly one re-run line, with the reason, naming both heats
    const lines = await audit("heat_rerun");
    expect(lines.filter((l) => JSON.stringify(l.after).includes(newId))).toHaveLength(1);
    const line = lines.find((l) => JSON.stringify(l.after).includes(newId))!;
    expect(line.reason).toBe("kite tangle");
    expect(line.actor_user_id).toBe(f.userIds.head);
    expect(JSON.stringify(line.before)).toContain(orig.id);
    // the Final's seat waits for the re-run: publishing it fills the seat (below)
    expect((await heatUid("R1-H1")).data!.id).toBe(newId);
  });

  it("riders left out are ranked last: Blue Did not start, Red Disqualified; the riders who rode first; later seats follow the re-run", async () => {
    const re = (await heatUid("R1-H1")).data!;
    const slots = await slotsOf(re.id);
    // a second re-run of the re-run: the leave-out is chosen now
    await f.s.from("heats").update({ status: "running", started_at: ago(100) }).eq("id", re.id);
    const newId = randomUUID();
    const leave = { [slots[1].entry_id as string]: "DNS", [slots[2].entry_id as string]: "DSQ" };
    expect(codeOf(await run(f.clients.orgA, re.id, newId, "second tangle", leave))).toBe("");
    const second = (await f.s.from("heats").select("number_suffix, name, draw_uid").eq("id", newId).single()).data!;
    expect(second).toMatchObject({ number_suffix: "R2", name: "Heat 1 re-run 2", draw_uid: "R1-H1" });
    const seats = await slotsOf(newId);
    expect(seats.map((s) => s.modifier)).toEqual([null, "DNS", "DSQ"]);

    // the one rider who rides is scored; the heat is ended and published
    await f.s.from("heats").update({ status: "ended", started_at: ago(900), ended_at: ago(300) }).eq("id", newId);
    const a = (await f.s.from("trick_attempts").insert({ heat_id: newId, entry_id: slots[0].entry_id, seq: 1, status: "landed", trick_name: "Backroll", client_key: key() }).select("id").single()).data!;
    for (const seat of [f.ids.seat_j1, f.ids.seat_j2, f.ids.seat_j3]) {
      await f.s.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: seat, score: 7, client_key: key(), client_rev: 1 });
      await f.s.from("impression_scores").insert({ heat_id: newId, entry_id: slots[0].entry_id, judge_seat_id: seat, value: 5, client_key: key(), client_rev: 1 });
      await f.s.from("judge_sheets").upsert({ event_id: f.ids.evA1, heat_id: newId, judge_seat_id: seat, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
    }
    expect(await publishHeatCore({ user: f.clients.head, service: f.s }, newId)).toMatchObject({ ok: true, version: 1 });
    const results = (await f.s.from("heat_results").select("entry_id, place, total").eq("heat_id", newId)).data!;
    expect(results.find((r) => r.entry_id === slots[0].entry_id)!.place).toBe(1);
    expect(results.find((r) => r.entry_id === slots[1].entry_id)).toMatchObject({ place: 2, total: null }); // Did not start
    expect(results.find((r) => r.entry_id === slots[2].entry_id)).toMatchObject({ place: 3, total: null }); // Disqualified, below Did not start
    // the Final's seat that waited for "1st of Heat 1" now holds the rider who rode
    const final = (await heatUid("F-H1")).data!;
    expect((await slotsOf(final.id))[0].entry_id).toBe(slots[0].entry_id);
    expect(((await f.clients.head.from("trick_attempts").select("id").eq("heat_id", re.id)).data ?? []).length).toBe(0);
  });

  it("refused for judges, spotters and another organisation, for a heat that is published, one that never started and one that is cancelled and already re-run", async () => {
    const h2 = (await heatUid("R1-H2")).data!;
    await f.s.from("heats").update({ status: "running", started_at: ago(100) }).eq("id", h2.id);
    for (const who of ["j1", "spotter", "announcer", "orgB"] as const) expect(codeOf(await run(f.clients[who], h2.id, randomUUID(), "kite tangle"))).toContain("NOT_ALLOWED");
    expect(codeOf(await run(f.clients.head, h2.id, randomUUID(), " "))).toContain("REASON_REQUIRED");
    // published: "Re-open the heat instead"
    await f.s.from("heats").update({ status: "published", ended_at: ago(50), published_at: ago(10) }).eq("id", h2.id);
    expect(codeOf(await run(f.clients.head, h2.id, randomUUID(), "kite tangle"))).toContain("HEAT_PUBLISHED");
    // never started
    const fin = (await heatUid("F-H1")).data!;
    expect(codeOf(await run(f.clients.head, fin.id, randomUUID(), "kite tangle"))).toContain("HEAT_NOT_STARTED");
    // cancelled, and its re-run already exists (Console v2: a cancelled heat can be re-run, but only once)
    const old = (await heatsOf()).find((h) => h.status === "cancelled")!;
    expect(codeOf(await run(f.clients.head, old.id, randomUUID(), "kite tangle"))).toContain("HEAT_ALREADY_RERUN");
  });

  it("the run order: the re-run goes right after the live heat; a stale plan stamp or a wrong item list changes nothing", async () => {
    const h2 = (await heatUid("R1-H2")).data!;
    await f.s.from("heats").update({ status: "running", started_at: ago(100), published_at: null, ended_at: null }).eq("id", h2.id);
    const plan = (await f.s.from("schedule_plans").select("id, items, updated_at").eq("id", planId).single()).data!;
    const items = plan.items as unknown as SchedulePlan["items"];
    const newId = randomUUID();
    const withRerun = insertRerunItem({ id: plan.id, name: "x", active: false, items, anchors: {}, actualStarts: {} } as unknown as SchedulePlan, h2.id, newId, h2.id).items;
    expect(withRerun.length).toBe(items.length + 1);
    const before = JSON.stringify({ heats: await heatsOf(), plan: (await f.s.from("schedule_plans").select("items").eq("id", planId).single()).data });
    // stale stamp
    expect(codeOf(await run(f.clients.head, h2.id, newId, "kite tangle", {}, { id: planId, items: withRerun, updatedAt: "2020-01-01T00:00:00Z" }))).toContain("PLAN_CHANGED");
    // two items added
    expect(codeOf(await run(f.clients.head, h2.id, newId, "kite tangle", {}, { id: planId, items: [...withRerun, { id: "extra", kind: "note", label: "x" }], updatedAt: plan.updated_at }))).toContain("BAD_PLAN_ITEMS");
    // an existing item changed
    const tampered = withRerun.map((i, k) => (k === 0 ? { ...i, durationMin: 99 } : i));
    expect(codeOf(await run(f.clients.head, h2.id, newId, "kite tangle", {}, { id: planId, items: tampered, updatedAt: plan.updated_at }))).toContain("BAD_PLAN_ITEMS");
    expect(JSON.stringify({ heats: await heatsOf(), plan: (await f.s.from("schedule_plans").select("items").eq("id", planId).single()).data })).toBe(before);
    // the right items go through, in the same transaction
    expect(codeOf(await run(f.clients.head, h2.id, newId, "kite tangle", {}, { id: planId, items: withRerun, updatedAt: plan.updated_at }))).toBe("");
    const stored = (await f.s.from("schedule_plans").select("items").eq("id", planId).single()).data!.items as Array<{ heatId?: string }>;
    const at = stored.findIndex((i) => i.heatId === h2.id);
    expect(stored[at + 1].heatId).toBe(newId);
  });
});
