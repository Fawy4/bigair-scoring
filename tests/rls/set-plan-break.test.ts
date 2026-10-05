import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { codeOf } from "./live-helpers";

// Polish 4, I: the head console's break controls change the run order's own break. Only a head seat or the organiser, only the active run order, only a heat row,
// the plan's other rows untouched, one audit line.
describe.skipIf(!ENV_OK)("set_plan_break (hosted development project)", () => {
  let f: Fixture;
  let plan: string;
  const items = [
    { id: "i1", kind: "heat", heatId: "h1", breakAfterMin: 2 },
    { id: "i2", kind: "heat", heatId: "h2" },
    { id: "b1", kind: "break", label: "Lunch", durationMin: 30 },
  ];
  const row = async () => (await f.s.from("schedule_plans").select("items, anchors, active, updated_at").eq("id", plan).single()).data!;
  const audit = async () => (await f.s.from("audit_log").select("action, reason").eq("action", "plan_break_set").eq("row_id", plan)).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    plan = (await f.s.from("schedule_plans").insert({ event_id: f.ids.evA1, name: "Break plan", day: "2026-10-11", active: true, items, anchors: { i2: "10:30", i1: "10:00" } }).select("id").single()).data!.id;
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("the head seat sets the break after a heat (to the second) and drops the pin on the next heat; nothing else in the plan changes; one audit line says so", async () => {
    const before = await row();
    const res = await f.clients.head.rpc("set_plan_break", { p_plan: plan, p_item: "i1", p_break_min: 2.5, p_anchors: { i1: "10:00" }, p_reason: "Break +1 min: the next heat now starts 10:13", p_expected: before.updated_at });
    expect(codeOf(res)).toBe("");
    const after = await row();
    const items2 = after.items as Array<Record<string, unknown>>;
    expect(items2[0].breakAfterMin).toBe(2.5);
    expect(items2[1]).toEqual(items[1]);
    expect(items2[2]).toEqual(items[2]);
    expect(after.anchors).toEqual({ i1: "10:00" });
    const lines = await audit();
    expect(lines).toHaveLength(1);
    expect(lines[0].reason).toContain("Break +1 min");
  });

  it("the organiser may too; everybody else is refused and the plan stays as it was", async () => {
    expect(codeOf(await f.clients.orgA.rpc("set_plan_break", { p_plan: plan, p_item: "i1", p_break_min: 3, p_anchors: {} }))).toBe("");
    const mine = await row();
    for (const who of ["j1", "spotter", "announcer", "orgB", "bJudge", "anon"] as const) {
      expect(codeOf(await f.clients[who].rpc("set_plan_break", { p_plan: plan, p_item: "i1", p_break_min: 9, p_anchors: {} })), who).not.toBe("");
    }
    expect((await row()).items).toEqual(mine.items);
  });

  it("refuses a value that is not a break: a negative or huge number, an item that is not a heat or not there, a bad pin; and a stale screen", async () => {
    for (const bad of [-1, 241]) expect(codeOf(await f.clients.head.rpc("set_plan_break", { p_plan: plan, p_item: "i1", p_break_min: bad, p_anchors: {} }))).toContain("BAD_PLAN_VALUE");
    expect(codeOf(await f.clients.head.rpc("set_plan_break", { p_plan: plan, p_item: "b1", p_break_min: 1, p_anchors: {} }))).toContain("BAD_PLAN_VALUE");
    expect(codeOf(await f.clients.head.rpc("set_plan_break", { p_plan: plan, p_item: "nope", p_break_min: 1, p_anchors: {} }))).toContain("BAD_PLAN_VALUE");
    expect(codeOf(await f.clients.head.rpc("set_plan_break", { p_plan: plan, p_item: "i1", p_break_min: 1, p_anchors: { i2: "25:99" } }))).toContain("BAD_PLAN_VALUE");
    expect(codeOf(await f.clients.head.rpc("set_plan_break", { p_plan: plan, p_item: "i1", p_break_min: 1, p_anchors: {}, p_expected: "2020-01-01T00:00:00Z" }))).toContain("PLAN_CHANGED");
  });

  it("only the active run order", async () => {
    await f.s.from("schedule_plans").update({ active: false }).eq("id", plan);
    expect(codeOf(await f.clients.head.rpc("set_plan_break", { p_plan: plan, p_item: "i1", p_break_min: 1, p_anchors: {} }))).toContain("PLAN_NOT_ACTIVE");
  });
});
