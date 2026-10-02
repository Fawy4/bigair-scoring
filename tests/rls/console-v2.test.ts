import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rerunName } from "@/lib/live/rerun";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Console v2 (head judge console redesign), the database side, on the hosted development project:
//  §3 the head judge may start any heat that has not started, in any order, in any division whose draw is locked and seats are filled; a cancelled heat cannot be started;
//  §4 Re-run works on a cancelled heat (once), with the same rules as before: refused for judges, spotters and another organisation;
//  §2 the head seat and the organiser can read the judges' seat names (never the PIN columns); a judge cannot read another judge's seat.
describe.skipIf(!ENV_OK)("Console v2: start any heat, re-run a cancelled heat, judge names (hosted development project)", () => {
  let f: Fixture;
  let a: LiveDivision;
  let b: LiveDivision;
  let unlocked: LiveDivision;
  const setMax = (n: number) => f.s.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: n } }).eq("id", f.ids.evA1);
  const status = async (id: string) => (await f.s.from("heats").select("status, started_at").eq("id", id).single()).data!;
  const rerun = async (client: SupabaseClient, heatId: string, reason = "kite tangle") => {
    const { data } = await f.s.from("heats").select("number, number_suffix, name").eq("id", heatId).single();
    const n = rerunName({ number: data!.number, suffix: data!.number_suffix, name: data!.name });
    const newId = randomUUID();
    const res = await client.rpc("rerun_heat", { p_heat: heatId, p_new_heat: newId, p_suffix: n.suffix, p_name: n.name, p_reason: reason, p_leave_out: {} as never, p_plan: null as never, p_plan_items: null as never, p_plan_updated_at: null as never });
    return { res, newId };
  };

  beforeAll(async () => {
    f = await buildFixture();
    a = await mkDivision(f, { name: "V2 Men", seats: ["j1", "j2", "j3"] });
    b = await mkDivision(f, { name: "V2 Women", seats: ["j1", "j2", "j3"] });
    unlocked = await mkDivision(f, { name: "V2 Open", seats: ["j1", "j2", "j3"], locked: false });
    await f.s.from("heats").update({ status: "ended", ended_at: ago(10) }).in("id", [f.ids.H1, f.ids.H4, f.ids.H5]);
    await setMax(5);
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  describe("start out of order", () => {
    it("the head seat starts Heat 2 before Heat 1, in a second division before the first, and the server stamps the start", async () => {
      const h1 = await mkHeat(f, a);
      const h2 = await mkHeat(f, a);
      const w1 = await mkHeat(f, b);
      expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h2 }))).toBe("");
      expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: w1 }))).toBe("");
      expect((await status(h2)).status).toBe("running");
      expect((await status(h2)).started_at).not.toBeNull();
      expect((await status(h1)).status).toBe("scheduled"); // Heat 1 waits: nothing was started for it
      await f.s.from("heats").update({ status: "ended" }).in("id", [h2, w1]);
      await f.s.from("heats").update({ status: "ended" }).eq("id", h1);
    });

    it("an organiser of the event can start out of order too", async () => {
      const first = await mkHeat(f, a);
      const second = await mkHeat(f, a);
      expect(codeOf(await f.clients.orgA.rpc("start_heat", { p_heat: second }))).toBe("");
      await f.s.from("heats").update({ status: "ended" }).in("id", [first, second]);
    });

    it("refused on a division whose draw is not locked, and while seats are not filled; judges, spotters and another organisation cannot", async () => {
      const open = await mkHeat(f, unlocked);
      expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: open }))).toContain("DRAW_NOT_LOCKED");
      expect(codeOf(await f.clients.orgA.rpc("start_heat", { p_heat: open }))).toContain("DRAW_NOT_LOCKED");
      const hole = await mkHeat(f, a, {}, { placeholder: true });
      expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: hole }))).toContain("SEATS_NOT_FILLED");
      const ok = await mkHeat(f, a);
      for (const who of ["j1", "spotter", "announcer", "orgB", "bJudge"] as const) expect(codeOf(await f.clients[who].rpc("start_heat", { p_heat: ok })), who).toContain("NOT_ALLOWED");
      expect((await status(ok)).status).toBe("scheduled");
      await f.s.from("heats").update({ status: "ended" }).in("id", [open, hole, ok]);
    });

    it("a cancelled heat cannot be started", async () => {
      const h = await mkHeat(f, a, { status: "running", started_at: ago(100) });
      expect(codeOf(await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: "kite tangle" }))).toBe("");
      expect(codeOf(await f.clients.head.rpc("start_heat", { p_heat: h }))).toContain("ILLEGAL_HEAT_TRANSITION");
      expect(codeOf(await f.clients.orgA.rpc("start_heat", { p_heat: h }))).toContain("ILLEGAL_HEAT_TRANSITION");
      expect((await status(h)).status).toBe("cancelled");
    });
  });

  describe("re-run a cancelled heat", () => {
    it("the head seat re-runs a cancelled heat: the '3R' heat has the same riders and seats, the cancelled one is untouched, and there is one audit line with the reason", async () => {
      const h = await mkHeat(f, a, { status: "running", started_at: ago(200) });
      expect(codeOf(await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: "wind dropped" }))).toBe("");
      const before = (await f.s.from("heat_slots").select("position, entry_id").eq("heat_id", h).order("position")).data!;
      const { res, newId } = await rerun(f.clients.head, h, "restart after the wind");
      expect(codeOf(res)).toBe("");
      const re = (await f.s.from("heats").select("status, number, number_suffix, name, rerun_of, duration_sec").eq("id", newId).single()).data!;
      expect(re).toMatchObject({ status: "scheduled", number_suffix: "R", rerun_of: h });
      expect(re.name).toMatch(/re-run$/);
      expect((await f.s.from("heat_slots").select("position, entry_id").eq("heat_id", newId).order("position")).data).toEqual(before);
      expect((await status(h)).status).toBe("cancelled");
      const lines = (await f.s.from("audit_log").select("reason, before, after").eq("event_id", f.ids.evA1).eq("action", "heat_rerun")).data!.filter((l) => JSON.stringify(l.after).includes(newId));
      expect(lines).toHaveLength(1);
      expect(lines[0].reason).toBe("restart after the wind");
      expect(JSON.stringify(lines[0].before)).toContain('"cancelled"');
    });

    it("an organiser can do the same", async () => {
      const h = await mkHeat(f, a, { status: "running", started_at: ago(200) });
      await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: "wind dropped" });
      expect(codeOf((await rerun(f.clients.orgA, h)).res)).toBe("");
    });

    it("refused for judges, spotters, an announcer, another organisation's people and a visitor; nothing is created", async () => {
      const h = await mkHeat(f, a, { status: "running", started_at: ago(200) });
      await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: "wind dropped" });
      const count = async () => ((await f.s.from("heats").select("id").eq("rerun_of", h)).data ?? []).length;
      for (const who of ["j1", "spotter", "announcer", "orgB", "bJudge"] as const) expect(codeOf((await rerun(f.clients[who], h)).res), who).toContain("NOT_ALLOWED");
      expect(codeOf((await rerun(f.clients.anon, h)).res)).not.toBe("");
      expect(await count()).toBe(0);
    });

    it("a cancelled heat can be re-run once; a second try says it has already been re-run", async () => {
      const h = await mkHeat(f, a, { status: "running", started_at: ago(200) });
      await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: "wind dropped" });
      expect(codeOf((await rerun(f.clients.head, h)).res)).toBe("");
      expect(codeOf((await rerun(f.clients.head, h)).res)).toContain("HEAT_ALREADY_RERUN");
      expect(((await f.s.from("heats").select("id").eq("rerun_of", h)).data ?? []).length).toBe(1);
    });

    it("a heat cancelled before it ever started, and a reason that is too short, are still refused", async () => {
      const never = await mkHeat(f, a);
      await f.clients.head.rpc("cancel_heat", { p_heat: never, p_reason: "wrong division" });
      expect(codeOf((await rerun(f.clients.head, never)).res)).toContain("HEAT_NOT_STARTED");
      const h = await mkHeat(f, a, { status: "running", started_at: ago(200) });
      await f.clients.head.rpc("cancel_heat", { p_heat: h, p_reason: "wind dropped" });
      expect(codeOf((await rerun(f.clients.head, h, " ")).res)).toContain("REASON_REQUIRED");
    });
  });

  describe("judge names on the console", () => {
    it("the head seat and the organiser can read the panel's seat names; a judge reads only their own seat; the PIN columns stay closed", async () => {
      const ids = [f.ids.seat_j1, f.ids.seat_j2, f.ids.seat_j3];
      for (const who of ["head", "orgA"] as const) {
        const { data, error } = await f.clients[who].from("judge_seats").select("id, name").in("id", ids);
        expect(error, who).toBeNull();
        expect((data ?? []).map((s) => s.id).sort()).toEqual([...ids].sort());
        expect((data ?? []).every((s) => typeof s.name === "string" && s.name.length > 0)).toBe(true);
      }
      const asJudge = await f.clients.j1.from("judge_seats").select("id, name").in("id", ids);
      expect((asJudge.data ?? []).map((s) => s.id)).toEqual([f.ids.seat_j1]);
      expect((await f.clients.head.from("judge_seats").select("pin_hash").in("id", ids)).error).not.toBeNull();
    });
  });
});
