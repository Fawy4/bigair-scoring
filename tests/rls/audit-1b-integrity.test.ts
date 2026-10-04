import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENV_OK } from "./helpers";
import { ago, codeOf, key } from "./live-helpers";
import { buildGouna, sharedFixture, type GounaWorld } from "./audit-1b-world";

// Audit 1b, part 6 — data integrity on the hosted development project (docs/AUDIT.md). Throwaway organisation only.
describe.skipIf(!ENV_OK)("Audit 1b — data integrity", () => {
  let w: GounaWorld;
  beforeAll(async () => {
    w = await buildGouna({ name: "Integrity" });
  }, 600_000);
  afterAll(async () => {
    if (ENV_OK) await (await sharedFixture()).cleanup();
  });

  // A1b-16: the Riders step refuses "Remove" for a rider already in the draw only when the database says 23503 (a row that points at the entry). heat_slots point
  // at entries with ON DELETE SET NULL, so a rider who has a seat but no attempt yet is removed without a word: the seat goes empty, the stored draw still names the
  // rider, and Start heat is then refused "a seat is still waiting for a place" on a locked draw nobody can re-arrange.
  it("A1b-16 (fixed in Fix 2): removing a rider who has a seat in a locked draw is refused (ENTRY_IN_DRAW), nothing changes; a rider without a seat can still be removed", async () => {
    const victim = w.entries[13];
    const seat = (await w.f.s.from("heat_slots").select("heat_id, position").eq("entry_id", victim).single()).data!;
    const r = await w.f.clients.orgA.from("entries").delete().eq("id", victim).select("id");
    expect(codeOf(r)).toContain("ENTRY_IN_DRAW");
    expect((await w.f.s.from("entries").select("id").eq("id", victim)).data).toHaveLength(1);
    expect((await w.f.s.from("heat_slots").select("entry_id").eq("heat_id", seat.heat_id).eq("position", seat.position).single()).data!.entry_id).toBe(victim);
    // a rider with no seat (a new entry in the division) is removed as before
    const rider = (await w.f.s.from("riders").insert({ organisation_id: w.f.ids.orgA, first_name: "Late", last_name: "Entry" }).select("id").single()).data!;
    const e = (await w.f.s.from("entries").insert({ division_id: w.div, rider_id: rider.id, seed: 99, status: "registered", source: "manual" }).select("id").single()).data!;
    const ok = await w.f.clients.orgA.from("entries").delete().eq("id", e.id).select("id");
    expect(codeOf(ok)).toBe("");
    expect(ok.data).toHaveLength(1);
  });

  it("a rider with attempts cannot be removed (the 23503 path the Riders step words as 'already in the draw')", async () => {
    const h = await w.heatByUid(w.uids[0][7]);
    const slots = await w.seats(h.id);
    await w.f.s.from("heats").update({ status: "running", started_at: ago(60) }).eq("id", h.id);
    await w.f.s.from("trick_attempts").insert({ heat_id: h.id, entry_id: slots[0].entry_id, seq: 1, status: "landed", trick_name: "Backroll", client_key: key() });
    const r = await w.f.clients.orgA.from("entries").delete().eq("id", slots[0].entry_id!).select("id");
    expect(r.error?.message).toContain("ENTRY_IN_DRAW"); // (the guard answers before the 23503 of the attempts' foreign key)
    await w.f.s.from("heats").update({ status: "ended", ended_at: ago(1) }).eq("id", h.id);
  });

  it("a judge seat that has scores cannot be deleted (scores keep their judge); a seat without scores can", async () => {
    const h = await w.heatByUid(w.uids[0][6]);
    await w.scoreAndEnd(h.id);
    const r = await w.f.clients.orgA.from("judge_seats").delete().eq("id", w.f.ids.seat_j1).select("id");
    expect(codeOf(r) !== "" || (r.data ?? []).length === 0).toBe(true);
    expect((await w.f.s.from("judge_seats").select("id").eq("id", w.f.ids.seat_j1)).data).toHaveLength(1);
  }, 120_000);

  it("a division with heats cannot be deleted mid-event, even by its organiser", async () => {
    const r = await w.f.clients.orgA.from("divisions").delete().eq("id", w.div).select("id");
    expect(codeOf(r) !== "" || (r.data ?? []).length === 0).toBe(true);
    expect((await w.f.s.from("heats").select("id").eq("division_id", w.div)).data!.length).toBe(15);
  });

  // A1b-15: cancel_heat does not write down an armed heat's start first (pause, end and abort do). A heat that went green by itself and was cancelled before any
  // phone wrote the start down keeps no start and no end, so the run order thinks it never ran.
  it.fails("A1b-15: cancelling a heat that went green by itself keeps its real start and an end", async () => {
    const h = await w.heatByUid(w.uids[0][5]);
    await w.f.s.from("heats").update({ armed_at: ago(40), prestart_sec: 10 }).eq("id", h.id);
    expect(codeOf(await w.head.rpc("cancel_heat", { p_heat: h.id, p_reason: "wind died" }))).toBe("");
    const row = (await w.f.s.from("heats").select("status, started_at, ended_at").eq("id", h.id).single()).data!;
    expect(row.started_at).not.toBeNull();
    expect(row.ended_at).not.toBeNull();
  });
});
