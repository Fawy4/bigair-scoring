import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyHeatStatuses } from "@/lib/draw/entrants";
import { drawProjection } from "@/lib/draw/projection";
import { applyHeatResult, expandFormat, lockDraw, type DivisionDraw } from "@/lib/engine/ladder";
import { heatResetPlan, rebuildTarget, resetTarget } from "@/lib/reset/plan";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf } from "./live-helpers";

// Reset per section (branch fix-reset-visibility) on the hosted development project, throwaway organisations only:
//   Reset this division (reset_division), Clear actual times (clear_plan_actuals), Reset this heat (reset_heat), and Reset event for a division with no saved copy (rebuild).
// Each: the organiser is allowed; judge, spotter and another organisation are refused; any heat running or paused refuses it.
describe.skipIf(!ENV_OK)("Reset per section (hosted development project)", () => {
  let f: Fixture;
  const s = () => f.s;
  const as = (who: "orgA" | "orgB" | "head" | "j1" | "spotter" | "announcer") => f.clients[who];

  /**
   * An event of organisation A with one division (6 riders, knockout: heats of 3, one advances, final of 2), a run order with pins, a break with an actual start,
   * and the fixture's head, judge and spotter bound to it. `lock` takes the saved copy (organiser), or locks without one (service) like a division locked before Reset existed.
   */
  const world = async (key: string, lock: "copy" | "no-copy" = "copy") => {
    const ins = async <T>(table: string, row: object): Promise<T & { id: string }> => {
      const { data, error } = await s().from(table).insert(row).select().single();
      if (error) throw new Error(`insert ${table}: ${error.message}`);
      return data as T & { id: string };
    };
    const ev = await ins<{ id: string }>("events", { organisation_id: f.ids.orgA, name: `Sect ${key}`, slug: `sect-${key}-${f.ids.orgA.slice(0, 6)}`, status: "draft", timezone: "Africa/Cairo", start_date: "2026-11-01", end_date: "2026-11-02", settings: {} });
    const div = await ins<{ id: string }>("divisions", { event_id: ev.id, name: `Pro ${key}`, sort_order: 1 });
    const entries: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const rider = await ins<{ id: string }>("riders", { organisation_id: f.ids.orgA, first_name: `S${i}`, last_name: key });
      entries.push((await ins<{ id: string }>("entries", { division_id: div.id, rider_id: rider.id, seed: i, status: "confirmed", source: "manual" })).id);
    }
    const template = parseFormatTemplate({
      id: "t", name: "Knockout", entrants: { min: 2, max: null }, timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 2 }, kind: "generator",
      generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed: "by_original_seed" } },
    });
    const draw = expandFormat(template, entries.map((id, i) => ({ id, name: `R${i + 1}` })), { identification: "name-callout" });
    await s().from("divisions").update({ draw: draw as never }).eq("id", div.id);
    const projection = drawProjection(draw);
    const roundIds = new Map<string, string>();
    for (const r of projection.rounds) roundIds.set(r.key, (await ins<{ id: string }>("rounds", { division_id: div.id, sort_order: r.sort_order, name: r.name, short_name: r.short_name, spec: r.spec })).id);
    const heats: Record<string, string> = {};
    for (const h of projection.heats) {
      heats[h.uid] = (await ins<{ id: string }>("heats", { round_id: roundIds.get(h.round_key)!, division_id: div.id, event_id: ev.id, number: h.number, draw_uid: h.uid, duration_sec: h.duration_sec, warm_up_sec: 0 })).id;
      for (const sl of h.slots) await ins("heat_slots", { heat_id: heats[h.uid], position: sl.position, entry_id: sl.entry_id, vest_colour: sl.vest_colour, source: sl.source });
    }
    const heatIds = Object.values(heats);
    const plan = await ins<{ id: string }>("schedule_plans", {
      event_id: ev.id, day: "2026-11-01", name: "Plan A", active: true, defaults: {}, hold: null,
      items: [...heatIds.map((h, i) => ({ id: `i${i}`, kind: "heat", heatId: h })), { id: "b1", kind: "break", label: "Lunch", durationMin: 30 }],
      anchors: { i0: "10:00", i1: "10:40", b1: "12:00" },
      actual_starts: { b1: new Date().toISOString() },
    });
    // the seats of the fixture's official users on this event
    const seat = async (userKey: string, name: string, role: "judge" | "head" | "spotter", scores: boolean) =>
      (await ins<{ id: string }>("judge_seats", { event_id: ev.id, name, role, scores, auth_user_id: f.userIds[userKey], status: "active", active: true })).id;
    const judgeSeat = await seat("j1", "Judge", "judge", true);
    await seat("head", "Head", "head", false);
    await seat("spotter", "Spotter", "spotter", false);
    if (lock === "copy") expect(codeOf(await as("orgA").rpc("lock_division_draw", { p_division: div.id }))).toBe("");
    else await s().from("divisions").update({ draw_locked_at: new Date().toISOString(), draw: lockDraw(draw) as never }).eq("id", div.id);
    return { event: ev.id, slug: `sect-${key}-${f.ids.orgA.slice(0, 6)}`, division: div.id, entries, heats, heatIds, draw, template, plan: plan.id, judgeSeat, ins };
  };
  type World = Awaited<ReturnType<typeof world>>;
  const heatOf = (w: World, n: number) => w.heatIds[n - 1];
  const row = async (id: string) => (await s().from("heats").select("status, started_at, ended_at, published_at, rerun_of").eq("id", id).single()).data!;
  const count = async (table: string, heat: string) => ((await s().from(table).select("id").eq("heat_id", heat)).data ?? []).length;
  const audits = async (event: string, action: string) => (await s().from("audit_log").select("action, before, after, reason, actor_user_id").eq("event_id", event).eq("action", action)).data ?? [];
  const slotsOf = async (heat: string) => (await s().from("heat_slots").select("position, entry_id, source, place, total, modifier").eq("heat_id", heat).order("position")).data ?? [];

  /** Heat 1 ran: attempts, scores, an Impression score, a penalty, a judge's sheet; it ended. `publish` then publishes it the way the server does (draw + the winner's next seat). */
  const play = async (w: World, n = 1, o: { publish?: boolean; hold?: boolean } = {}) => {
    const heat = heatOf(w, n);
    const [e1, e2] = (await slotsOf(heat)).map((x) => x.entry_id as string);
    await s().from("heats").update({ status: "running", started_at: ago(900) }).eq("id", heat);
    const a1 = await w.ins<{ id: string }>("trick_attempts", { heat_id: heat, entry_id: e1, seq: 1, client_key: randomUUID(), status: "landed", trick_name: "Backroll" });
    await w.ins("trick_attempts", { heat_id: heat, entry_id: e2, seq: 2, client_key: randomUUID(), status: "crashed", trick_name: "Frontroll" });
    await w.ins("trick_scores", { attempt_id: a1.id, heat_id: heat, judge_seat_id: w.judgeSeat, score: 7.5, client_key: randomUUID(), client_rev: 1 });
    await w.ins("impression_scores", { heat_id: heat, entry_id: e1, judge_seat_id: w.judgeSeat, value: 6, client_key: randomUUID(), client_rev: 1 });
    await w.ins("penalties", { heat_id: heat, entry_id: e2, type: "INT", value: {}, reason: "test" });
    await w.ins("judge_sheets", { event_id: w.event, heat_id: heat, judge_seat_id: w.judgeSeat, submitted_at: new Date().toISOString() });
    await s().from("heats").update({ status: "ended", ended_at: ago(300) }).eq("id", heat);
    if (!o.publish) return heat;
    const { data: div } = await s().from("divisions").select("draw").eq("id", w.division).single();
    const draw = div!.draw as unknown as DivisionDraw;
    const { data: rows } = await s().from("heats").select("draw_uid, status, started_at").eq("division_id", w.division);
    const synced = applyHeatStatuses(draw, rows ?? []);
    const drawHeat = synced.rounds.flatMap((r) => r.heats).find((h) => (h.uid ?? h.id) === Object.keys(w.heats)[n - 1])!;
    const ranked = drawHeat.slots.map((sl, i) => ({ entrantId: sl.entrantId!, place: i + 1, total: 10 - i, tieKeys: [] as number[] }));
    const applied = applyHeatResult(synced, drawHeat.id, { ranked });
    if (applied.conflict) throw new Error(applied.conflict.message);
    const before = new Map(drawProjection(synced).heats.map((h) => [h.uid, h]));
    const key = (x: { entry_id: string | null; modifier: string | null }) => `${x.entry_id ?? ""}|${x.modifier ?? ""}`;
    const projection = drawProjection(applied.draw).heats
      .filter((h) => h.uid !== (drawHeat.uid ?? drawHeat.id))
      .filter((h) => (before.get(h.uid)?.slots ?? []).map(key).join(",") !== h.slots.map(key).join(","))
      .map((h) => ({ uid: h.uid, slots: h.slots.map((x) => ({ position: x.position, entry_id: x.entry_id, modifier: x.modifier })) }));
    const res = await s().rpc("publish_heat_commit", {
      p_heat: heat, p_expected_version: 1, p_draw: applied.draw as never, p_projection: projection as never, p_hold: Boolean(o.hold), p_override_reason: "test", p_actor: f.userIds.orgA,
      p_results: ranked.map((r) => ({ entry_id: r.entrantId, place: r.place, total: r.total, percent: null, breakdown: null })) as never,
    });
    expect(codeOf(res)).toBe("");
    return heat;
  };

  /** The draw handed to reset_division / reset_event, made the way the server action makes it. */
  const itemFor = async (w: World, mode: "copy" | "rebuild") => {
    const { data } = await s().from("divisions").select("draw, draw_at_lock").eq("id", w.division).single();
    const t = mode === "copy" ? resetTarget(data!.draw_at_lock as unknown as DivisionDraw) : rebuildTarget(data!.draw as unknown as DivisionDraw);
    return { division: w.division, draw: t.draw, projection: t.projection };
  };
  const resetDivision = async (who: Parameters<typeof as>[0], w: World, mode: "copy" | "rebuild" = "copy", reason: string | null = null) => as(who).rpc("reset_division", { p_division: w.division, p_reason: reason as never, p_item: (await itemFor(w, mode)) as never });
  /** Reset this heat as the server action makes it: the pure plan takes the result out of the draw, the function checks and writes. */
  const resetHeat = async (who: Parameters<typeof as>[0], w: World, heat: string, reason: string | null = null) => {
    const { data: h } = await s().from("heats").select("draw_uid").eq("id", heat).single();
    const { data: div } = await s().from("divisions").select("draw").eq("id", w.division).single();
    const { data: rows } = await s().from("heats").select("draw_uid, status, started_at").eq("division_id", w.division);
    const draw = div!.draw as unknown as DivisionDraw;
    const drawHeat = draw.rounds.flatMap((r) => r.heats).find((x) => (x.uid ?? x.id) === h!.draw_uid);
    let p_draw: DivisionDraw | null = null;
    let p_seats: unknown[] = [];
    if (drawHeat && draw.results[drawHeat.id]) {
      const plan = heatResetPlan(applyHeatStatuses(draw, rows ?? []), h!.draw_uid!);
      if (!plan.ok) return { error: { message: `DOWNSTREAM_STARTED: ${plan.heats.join(", ")}` }, data: null };
      p_draw = plan.draw;
      p_seats = plan.seats;
    }
    return as(who).rpc("reset_heat", { p_heat: heat, p_reason: reason as never, p_before: (p_draw ? draw : null) as never, p_draw: p_draw as never, p_seats: p_seats as never });
  };

  beforeAll(async () => {
    f = await buildFixture();
  }, 120_000);
  afterAll(async () => {
    await f?.cleanup();
  });

  describe("Reset this division", () => {
    it("the organiser: every heat back to not started, attempts, scores, results, decisions and actual times wiped, the draw back to the saved copy, one audit line", async () => {
      const w = await world("div1");
      const h1 = await play(w, 1, { publish: true, hold: true });
      await s().from("heat_decisions").insert({ event_id: w.event, heat_id: h1, kind: "tie", payload: {}, reason: "test" });
      const before = (await s().from("divisions").select("draw_at_lock").eq("id", w.division).single()).data!.draw_at_lock;
      expect(await count("trick_attempts", h1)).toBe(2);
      const res = await resetDivision("orgA", w);
      expect(codeOf(res)).toBe("");
      expect(res.data).toMatchObject({ attempts: 2, rebuilt: false });
      for (const id of w.heatIds) expect(await row(id), id).toMatchObject({ status: "scheduled", started_at: null, ended_at: null, published_at: null });
      for (const t of ["trick_attempts", "trick_scores", "impression_scores", "penalties", "judge_sheets", "heat_decisions", "heat_results"]) expect(await count(t, h1), t).toBe(0);
      const { data: div } = await s().from("divisions").select("draw").eq("id", w.division).single();
      expect(div!.draw).toEqual(before); // the draw is the saved copy again
      // Round 2's seat that the winner had taken is a placeholder again
      const later = (await Promise.all(w.heatIds.slice(2).map(slotsOf))).flat();
      expect(later.every((x) => x.entry_id === null && x.source !== null)).toBe(true);
      const lines = await audits(w.event, "division_reset");
      expect(lines).toHaveLength(1);
      expect(lines[0].before).toMatchObject({ attempts: 2, published_results: 1 });
      expect(lines[0].after).toMatchObject({ rebuilt: false });
    });

    it("another division of the event is not touched", async () => {
      const w = await world("div2");
      const other = await w.ins<{ id: string }>("divisions", { event_id: w.event, name: "Other", sort_order: 2 });
      const round = await w.ins<{ id: string }>("rounds", { division_id: other.id, sort_order: 1, name: "R1", short_name: "R1", spec: {} });
      const otherHeat = await w.ins<{ id: string }>("heats", { round_id: round.id, division_id: other.id, event_id: w.event, number: 1, duration_sec: 600 });
      await s().from("heats").update({ status: "ended", started_at: ago(900), ended_at: ago(300) }).eq("id", otherHeat.id);
      await play(w, 1);
      expect(codeOf(await resetDivision("orgA", w))).toBe("");
      expect((await row(otherHeat.id)).status).toBe("ended");
    });

    it("re-run heats of the division are removed", async () => {
      const w = await world("div3");
      const h2 = heatOf(w, 2);
      await s().from("heats").update({ status: "running", started_at: ago(200) }).eq("id", h2);
      expect(codeOf(await as("head").rpc("cancel_heat", { p_heat: h2, p_reason: "wind dropped" }))).toBe("");
      const newId = randomUUID();
      const rr = await as("head").rpc("rerun_heat", { p_heat: h2, p_new_heat: newId, p_suffix: "R", p_name: "Heat 2 re-run", p_reason: "restart", p_leave_out: {} as never, p_plan: null as never, p_plan_items: null as never, p_plan_updated_at: null as never });
      expect(codeOf(rr)).toBe("");
      expect(await row(newId)).toMatchObject({ rerun_of: h2 });
      expect(codeOf(await resetDivision("orgA", w))).toBe("");
      expect((await s().from("heats").select("id").eq("id", newId)).data).toHaveLength(0);
      expect(await row(h2)).toMatchObject({ status: "scheduled", started_at: null });
    });

    it("no saved copy: it is a rebuild from the current draw (Round 1 kept, later seats back to placeholders), and the audit line says so", async () => {
      const w = await world("div4", "no-copy");
      expect((await s().from("divisions").select("draw_at_lock").eq("id", w.division).single()).data!.draw_at_lock).toBeNull();
      const h1 = await play(w, 1, { publish: true });
      const r1Before = (await Promise.all(w.heatIds.slice(0, 2).map(slotsOf))).flat().map((x) => x.entry_id);
      const preview = await as("orgA").rpc("reset_division_preview", { p_division: w.division });
      expect(preview.data).toMatchObject({ has_copy: false, drawn: true });
      const res = await resetDivision("orgA", w, "rebuild", "xxxxx");
      expect(codeOf(res)).toBe("");
      expect(res.data).toMatchObject({ rebuilt: true });
      expect(await count("heat_results", h1)).toBe(0);
      expect((await Promise.all(w.heatIds.slice(0, 2).map(slotsOf))).flat().map((x) => x.entry_id)).toEqual(r1Before); // Round 1 as it was
      expect((await Promise.all(w.heatIds.slice(2).map(slotsOf))).flat().every((x) => x.entry_id === null)).toBe(true);
      expect((await audits(w.event, "division_reset"))[0].after).toMatchObject({ rebuilt: true });
      // a rebuild that is not this division's own draw is refused
      const w2 = await world("div4b", "no-copy");
      const item = await itemFor(w2, "rebuild");
      const tampered = { ...item, draw: { ...(item.draw as object), seedOrder: [...(item.draw as DivisionDraw).seedOrder].reverse() } };
      expect(codeOf(await as("orgA").rpc("reset_division", { p_division: w2.division, p_reason: null as never, p_item: tampered as never }))).toContain("BAD_PROJECTION");
    });

    it("a reason is needed when results were shown publicly; without one nothing changes", async () => {
      const w = await world("div5");
      const h1 = await play(w, 1, { publish: true });
      expect(codeOf(await resetDivision("orgA", w, "copy", null))).toContain("REASON_REQUIRED");
      expect(await count("trick_attempts", h1)).toBe(2);
      expect(codeOf(await resetDivision("orgA", w, "copy", "re-seeding"))).toBe("");
    });

    it("judge, spotter and the head seat are refused; so is an organiser of another organisation; nothing changes", async () => {
      const w = await world("div6");
      const h1 = await play(w, 1);
      for (const who of ["j1", "spotter", "head", "orgB"] as const) expect(codeOf(await resetDivision(who, w)), who).toContain("NOT_ALLOWED");
      expect(codeOf(await as("orgB").rpc("reset_division_preview", { p_division: w.division }))).toContain("NOT_ALLOWED");
      expect(await count("trick_attempts", h1)).toBe(2);
    });

    it("refused while a heat of the event is running or paused, and names it", async () => {
      const w = await world("div7");
      const h = heatOf(w, 3);
      await s().from("heats").update({ status: "running", started_at: ago(30) }).eq("id", h);
      expect(codeOf(await resetDivision("orgA", w))).toMatch(/HEAT_RUNNING: Heat 3/);
      await s().from("heats").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", h);
      expect(codeOf(await resetDivision("orgA", w))).toContain("HEAT_RUNNING");
      expect((await as("orgA").rpc("reset_division_preview", { p_division: w.division })).data.running).toBe("Heat 3");
    });
  });

  describe("Clear actual times", () => {
    const handPins = async (plan: string) => (await s().from("schedule_plans").select("hand_pins, anchors, actual_starts").eq("id", plan).single()).data!;

    it("the organiser: the actual starts and the pins the console wrote are cleared, the pins set by hand stay (lunch, a pinned heat), one audit line", async () => {
      const w = await world("plan1");
      // the world's plan was written by the organiser's side: every pin is hand-set
      expect((await handPins(w.plan)).hand_pins).toEqual(expect.arrayContaining(["i0", "i1", "b1"]));
      // the head console moves the day while it runs: Shift pins two more items
      const shifted = await as("head").rpc("set_plan_anchors", { p_plan: w.plan, p_anchors: { i0: "10:00", i1: "10:40", b1: "12:00", i2: "11:07", i3: "11:30" } as never });
      expect(codeOf(shifted)).toBe("");
      expect((await handPins(w.plan)).hand_pins).not.toEqual(expect.arrayContaining(["i2"])); // the console's pins are not hand-set
      const res = await as("orgA").rpc("clear_plan_actuals", { p_plan: w.plan });
      expect(codeOf(res)).toBe("");
      expect(res.data).toMatchObject({ actual_starts: 1, pins: 2, kept: 3, known: true });
      const { data } = await s().from("schedule_plans").select("anchors, actual_starts, items").eq("id", w.plan).single();
      expect(data!.anchors).toEqual({ i0: "10:00", i1: "10:40", b1: "12:00" });
      expect(data!.actual_starts).toEqual({});
      expect((data!.items as unknown[]).length).toBe(w.heatIds.length + 1); // the run order itself stays
      const lines = await audits(w.event, "plan_actuals_cleared");
      expect(lines).toHaveLength(1);
      expect(lines[0].before).toMatchObject({ anchors: { i2: "11:07", i3: "11:30" } });
      expect(lines[0].after).toMatchObject({ pins_known: true });
    });

    it("a pin the console moved stays hand-set when the organiser had set it (the organiser's time is moved, not dropped)", async () => {
      const w = await world("plan1b");
      expect(codeOf(await as("head").rpc("set_plan_anchors", { p_plan: w.plan, p_anchors: { i0: "10:00", i1: "10:55", b1: "12:00" } as never }))).toBe("");
      expect((await handPins(w.plan)).hand_pins).toEqual(expect.arrayContaining(["i1"]));
      expect(codeOf(await as("orgA").rpc("clear_plan_actuals", { p_plan: w.plan }))).toBe("");
      expect((await handPins(w.plan)).anchors).toMatchObject({ i1: "10:55" });
    });

    it("a plan made before pins were marked (no list) keeps every pin, clears the actual starts, and says it could not tell", async () => {
      const w = await world("plan1c");
      await s().from("schedule_plans").update({ hand_pins: null }).eq("id", w.plan); // an older plan
      expect(codeOf(await as("head").rpc("set_plan_anchors", { p_plan: w.plan, p_anchors: { i0: "10:00", i1: "10:40", b1: "12:00", i2: "11:07" } as never }))).toBe("");
      expect((await handPins(w.plan)).hand_pins).toBeNull(); // the console does not make an older plan "known"
      const res = await as("orgA").rpc("clear_plan_actuals", { p_plan: w.plan });
      expect(res.data).toMatchObject({ actual_starts: 1, pins: 0, kept: 4, known: false });
      expect((await handPins(w.plan)).anchors).toMatchObject({ i2: "11:07" });
      expect((await audits(w.event, "plan_actuals_cleared"))[0].after).toMatchObject({ pins_known: false });
    });

    it("the organiser's own save marks the pins it changes as hand-set; the first save of an older plan marks every pin it has", async () => {
      const w = await world("plan1d");
      await s().from("schedule_plans").update({ hand_pins: null }).eq("id", w.plan);
      expect(codeOf(await as("head").rpc("set_plan_anchors", { p_plan: w.plan, p_anchors: { i0: "10:00", i1: "10:40", b1: "12:00", i2: "11:07" } as never }))).toBe("");
      const saved = await as("orgA").from("schedule_plans").update({ anchors: { i0: "10:00", i1: "10:40", b1: "12:00", i2: "11:07", i4: "14:00" } }).eq("id", w.plan).select("hand_pins");
      expect(saved.error).toBeNull();
      expect((saved.data![0].hand_pins as string[]).sort()).toEqual(["b1", "i0", "i1", "i2", "i4"]); // an older plan: all of them
      // from now on the console's pins are told apart
      expect(codeOf(await as("head").rpc("set_plan_anchors", { p_plan: w.plan, p_anchors: { i0: "10:00", i1: "10:40", b1: "12:00", i2: "11:07", i4: "14:00", i5: "14:30" } as never }))).toBe("");
      expect(await handPins(w.plan)).toMatchObject({ hand_pins: expect.not.arrayContaining(["i5"]) });
      const res = await as("orgA").rpc("clear_plan_actuals", { p_plan: w.plan });
      expect(res.data).toMatchObject({ pins: 1, known: true });
    });

    it("only the plan it is asked about changes", async () => {
      const w = await world("plan2");
      const other = await w.ins<{ id: string }>("schedule_plans", { event_id: w.event, day: "2026-11-02", name: "Plan B", items: [], anchors: { x: "09:00" }, actual_starts: { y: new Date().toISOString() }, defaults: {}, active: false });
      expect(codeOf(await as("orgA").rpc("clear_plan_actuals", { p_plan: w.plan }))).toBe("");
      expect(await handPins(other.id)).toMatchObject({ anchors: { x: "09:00" } });
      expect(Object.keys((await handPins(other.id)).actual_starts as object)).toEqual(["y"]);
    });

    it("judge, spotter, the head seat and another organisation are refused; nothing changes", async () => {
      const w = await world("plan3");
      for (const who of ["j1", "spotter", "head", "orgB"] as const) expect(codeOf(await as(who).rpc("clear_plan_actuals", { p_plan: w.plan })), who).toContain("NOT_ALLOWED");
      expect((await s().from("schedule_plans").select("anchors").eq("id", w.plan).single()).data!.anchors).toMatchObject({ i1: "10:40" });
    });

    it("refused while a heat is running, and names it", async () => {
      const w = await world("plan4");
      await s().from("heats").update({ status: "running", started_at: ago(30) }).eq("id", heatOf(w, 1));
      expect(codeOf(await as("orgA").rpc("clear_plan_actuals", { p_plan: w.plan }))).toMatch(/HEAT_RUNNING: Heat 1/);
      expect((await s().from("schedule_plans").select("anchors").eq("id", w.plan).single()).data!.anchors).toMatchObject({ i1: "10:40" });
    });
  });

  describe("Reset this heat", () => {
    it("the organiser, on an ended heat: not started, same seats, its attempts and scores kept as a record for the audit, one audit line", async () => {
      const w = await world("heat1");
      const h1 = await play(w, 1);
      const seats = await slotsOf(h1);
      const res = await resetHeat("orgA", w, h1);
      expect(codeOf(res)).toBe("");
      expect(await row(h1)).toMatchObject({ status: "scheduled", started_at: null, ended_at: null });
      expect((await slotsOf(h1)).map((x) => x.entry_id)).toEqual(seats.map((x) => x.entry_id));
      for (const t of ["trick_attempts", "trick_scores", "impression_scores", "penalties", "judge_sheets"]) expect(await count(t, h1), t).toBe(0);
      const rec = (await s().from("heat_reset_records").select("payload, taken_by").eq("heat_id", h1)).data!;
      expect(rec).toHaveLength(1);
      expect((rec[0].payload as { trick_attempts: unknown[] }).trick_attempts).toHaveLength(2);
      expect((rec[0].payload as { trick_scores: unknown[] }).trick_scores).toHaveLength(1);
      const lines = await audits(w.event, "heat_reset");
      expect(lines).toHaveLength(1);
      expect(lines[0].before).toMatchObject({ attempts: 2, heat_id: h1 });
    });

    it("the head seat may reset a heat too, from the console", async () => {
      const w = await world("heat2");
      const h1 = await play(w, 1);
      expect(codeOf(await resetHeat("head", w, h1))).toBe("");
      expect((await row(h1)).status).toBe("scheduled");
    });

    it("a published heat: the result is taken back, the draw loses it and the winner's seat in the next round is a placeholder again; a reason is needed", async () => {
      const w = await world("heat3");
      const h1 = await play(w, 1, { publish: true });
      expect(await slotsOf(h1)).toSatisfy((x: Array<{ place: number | null }>) => x.some((r) => r.place === 1));
      const filled = (await Promise.all(w.heatIds.slice(2).map(slotsOf))).flat().filter((x) => x.entry_id !== null);
      expect(filled.length).toBe(1);
      expect(codeOf(await resetHeat("orgA", w, h1, null))).toContain("REASON_REQUIRED");
      expect(await count("heat_results", h1)).toBe(3);
      expect(codeOf(await resetHeat("orgA", w, h1, "wrong heat published"))).toBe("");
      expect(await count("heat_results", h1)).toBe(0);
      expect((await slotsOf(h1)).every((x) => x.place === null && x.total === null)).toBe(true);
      expect((await Promise.all(w.heatIds.slice(2).map(slotsOf))).flat().every((x) => x.entry_id === null)).toBe(true);
      const { data: div } = await s().from("divisions").select("draw").eq("id", w.division).single();
      expect(Object.keys((div!.draw as unknown as DivisionDraw).results)).toHaveLength(0);
      expect((await s().from("heat_reset_records").select("payload").eq("heat_id", h1).single()).data!.payload).toMatchObject({ heat_results: expect.any(Array) });
    });

    it("a published heat cannot be reset when a later heat that depends on it has started", async () => {
      const w = await world("heat4");
      const h1 = await play(w, 1, { publish: true });
      const final = Object.keys(w.heats)[w.heatIds.length - 1];
      const target = heatOf(w, w.heatIds.length);
      await s().from("heats").update({ status: "ended", started_at: ago(100), ended_at: ago(50) }).eq("id", target);
      const { data: div } = await s().from("divisions").select("draw").eq("id", w.division).single();
      const draw = div!.draw as unknown as DivisionDraw;
      // the server action refuses it before the database is asked (the pure plan sees the started heat); the function refuses a plan that touches it all the same
      const own = await resetHeat("orgA", w, h1, "xxxxx");
      expect(codeOf(own as never) || "").toMatch(/DOWNSTREAM_STARTED|^$/);
      const fabricated = await as("orgA").rpc("reset_heat", { p_heat: h1, p_reason: "xxxxx", p_before: draw as never, p_draw: draw as never, p_seats: [{ uid: final, slots: [{ position: 1, entry_id: null, modifier: null }] }] as never });
      expect(codeOf(fabricated)).toContain("DOWNSTREAM_STARTED");
      expect(await count("heat_results", h1)).toBe(3);
    });

    it("a cancelled heat can be reset; a cancelled heat that was re-run cannot (reset the re-run); the re-run heat itself can", async () => {
      const w = await world("heat5");
      const h2 = heatOf(w, 2);
      await s().from("heats").update({ status: "running", started_at: ago(200) }).eq("id", h2);
      expect(codeOf(await as("head").rpc("cancel_heat", { p_heat: h2, p_reason: "kite tangle" }))).toBe("");
      expect(codeOf(await resetHeat("orgA", w, h2))).toBe("");
      expect((await row(h2)).status).toBe("scheduled");
      // again: cancelled, then re-run
      await s().from("heats").update({ status: "running", started_at: ago(200) }).eq("id", h2);
      await as("head").rpc("cancel_heat", { p_heat: h2, p_reason: "kite tangle" });
      const newId = randomUUID();
      expect(codeOf(await as("head").rpc("rerun_heat", { p_heat: h2, p_new_heat: newId, p_suffix: "R", p_name: "Heat 2 re-run", p_reason: "restart", p_leave_out: {} as never, p_plan: null as never, p_plan_items: null as never, p_plan_updated_at: null as never }))).toBe("");
      expect(codeOf(await resetHeat("orgA", w, h2))).toContain("HEAT_ALREADY_RERUN");
      expect((await row(h2)).status).toBe("cancelled");
      // the re-run is played and ended, then reset
      await s().from("heats").update({ status: "running", started_at: ago(300) }).eq("id", newId);
      await w.ins("trick_attempts", { heat_id: newId, entry_id: (await slotsOf(newId))[0].entry_id, seq: 1, client_key: randomUUID(), status: "landed", trick_name: "Backroll" });
      await s().from("heats").update({ status: "ended", ended_at: ago(100) }).eq("id", newId);
      const seats = (await slotsOf(newId)).map((x) => x.entry_id);
      expect(codeOf(await resetHeat("orgA", w, newId))).toBe("");
      expect(await row(newId)).toMatchObject({ status: "scheduled", rerun_of: h2 });
      expect((await slotsOf(newId)).map((x) => x.entry_id)).toEqual(seats);
      expect(await count("trick_attempts", newId)).toBe(0);
    });

    it("an under-review heat can be reset", async () => {
      const w = await world("heat6");
      const h1 = await play(w, 1);
      await s().from("heats").update({ status: "under_review" }).eq("id", h1);
      expect(codeOf(await resetHeat("orgA", w, h1))).toBe("");
    });

    it("a heat that has not started has nothing to reset", async () => {
      const w = await world("heat7");
      expect(codeOf(await resetHeat("orgA", w, heatOf(w, 1)))).toContain("HEAT_NOT_STARTED");
    });

    it("refused while any heat of the event is running or paused (this one too), and names it", async () => {
      const w = await world("heat8");
      const h1 = await play(w, 1);
      const h2 = heatOf(w, 2);
      await s().from("heats").update({ status: "running", started_at: ago(30) }).eq("id", h2);
      expect(codeOf(await resetHeat("orgA", w, h1))).toMatch(/HEAT_RUNNING: Heat 2/);
      await s().from("heats").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", h2);
      expect(codeOf(await resetHeat("orgA", w, h1))).toContain("HEAT_RUNNING");
      expect(codeOf(await resetHeat("orgA", w, h2))).toContain("HEAT_RUNNING");
      expect((await row(h1)).status).toBe("ended");
      expect(await count("trick_attempts", h1)).toBe(2);
    });

    it("judge, spotter and another organisation are refused; nothing changes", async () => {
      const w = await world("heat9");
      const h1 = await play(w, 1);
      for (const who of ["j1", "spotter", "orgB"] as const) expect(codeOf(await resetHeat(who, w, h1)), who).toContain("NOT_ALLOWED");
      expect(codeOf(await as("orgB").rpc("reset_heat_preview", { p_heat: h1 }))).toContain("NOT_ALLOWED");
      expect((await row(h1)).status).toBe("ended");
      expect(await count("trick_attempts", h1)).toBe(2);
    });

    it("the kept record is readable by the organiser and not by a judge or another organisation", async () => {
      const w = await world("heat10");
      const h1 = await play(w, 1);
      expect(codeOf(await resetHeat("orgA", w, h1))).toBe("");
      expect(((await as("orgA").from("heat_reset_records").select("id").eq("heat_id", h1)).data ?? []).length).toBe(1);
      for (const who of ["j1", "spotter", "orgB"] as const) expect(((await as(who).from("heat_reset_records").select("id").eq("heat_id", h1)).data ?? []).length, who).toBe(0);
    });
  });

  describe("Reset event for a division with no saved copy", () => {
    it("is rebuilt from the current draw: it works, says which divisions were rebuilt, and the audit line names them", async () => {
      const w = await world("ev1", "no-copy");
      const h1 = await play(w, 1, { publish: true });
      const item = await itemFor(w, "rebuild");
      expect(((await as("orgA").rpc("reset_event_preview", { p_event: w.event })).data as { divisions: Array<{ has_copy: boolean }> }).divisions[0].has_copy).toBe(false);
      const res = await as("orgA").rpc("reset_event", { p_event: w.event, p_slug: w.slug, p_reason: "xxxxx", p_draws: [item] as never });
      expect(codeOf(res)).toBe("");
      expect(res.data).toMatchObject({ rebuilt: [`Pro ev1`] });
      expect(await count("heat_results", h1)).toBe(0);
      expect((await row(h1)).status).toBe("scheduled");
      expect((await audits(w.event, "event_reset"))[0].after).toMatchObject({ rebuilt_divisions: ["Pro ev1"] });
    });

    it("a draw that is not the division's own is refused", async () => {
      const w = await world("ev2", "no-copy");
      const item = await itemFor(w, "rebuild");
      const other = { ...item, draw: { ...(item.draw as object), seedOrder: [] } };
      expect(codeOf(await as("orgA").rpc("reset_event", { p_event: w.event, p_slug: w.slug, p_reason: null as never, p_draws: [other] as never }))).toContain("BAD_PROJECTION");
    });

    it("judge, spotter and another organisation are refused; a running heat refuses it", async () => {
      const w = await world("ev3", "no-copy");
      const item = await itemFor(w, "rebuild");
      for (const who of ["j1", "spotter", "orgB"] as const) expect(codeOf(await as(who).rpc("reset_event", { p_event: w.event, p_slug: w.slug, p_reason: null as never, p_draws: [item] as never })), who).toContain("NOT_ALLOWED");
      await s().from("heats").update({ status: "running", started_at: ago(30) }).eq("id", heatOf(w, 1));
      expect(codeOf(await as("orgA").rpc("reset_event", { p_event: w.event, p_slug: w.slug, p_reason: null as never, p_draws: [item] as never }))).toContain("HEAT_RUNNING");
    });
  });
});
