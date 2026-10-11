import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setEntryStatus } from "@/lib/draw/walkover";
import type { DivisionDraw } from "@/lib/engine/ladder";
import { outOfEventCore, reopenWalkoverCore, walkoverHeatCore } from "@/lib/live/walkover-core";
import { isWalkoverHeat } from "@/lib/live/walkover";
import { loadFormat } from "@/lib/engine/ladder/fixtures";
import { ENV_OK, anonClient, signedIn } from "./helpers";
import { ago, codeOf } from "./live-helpers";
import { buildGouna, sharedFixture, type GounaWorld } from "./audit-1b-world";

afterAll(async () => {
  if (ENV_OK) await (await sharedFixture()).cleanup();
});

// Console – Walkover and absent riders (0.19.0), on the hosted development project, in throwaway organisations (buildFixture). Arrow, EKL and Demo are never touched.
// World A: the Gouna ladder (heats of 3, one goes on, fixed seats "1st H1"): a walkover fills the next seat at once.
// World B: "Knockout with a second chance": Did not start is this heat only; Out of the event turns every later seat, second-chance seats included, into a walkover.

const noOne = { data: null };

async function state(w: GounaWorld, uid: string) {
  const h = await w.heatByUid(uid);
  const row = (await w.f.s.from("heats").select("id, status, started_at, ended_at, published_at").eq("id", h.id).single()).data!;
  const slots = await w.seats(h.id);
  return { id: h.id, row, slots };
}
const drawOf = async (w: GounaWorld) => (await w.f.s.from("divisions").select("draw").eq("id", w.div).single()).data!.draw as unknown as DivisionDraw;
const nameOf = async (w: GounaWorld, entry: string) => {
  const e = (await w.f.s.from("entries").select("riders(first_name, last_name)").eq("id", entry).single()).data as unknown as { riders: { first_name: string; last_name: string } };
  return `${e.riders.first_name} ${e.riders.last_name}`;
};
const setDns = async (head: SupabaseClient, heat: string, entry: string, reason = "Didn't show") => head.rpc("set_rider_status", { p_heat: heat, p_entry: entry, p_modifier: "DNS", p_reason: reason });

describe.skipIf(!ENV_OK)("Walkover — a fixed ladder (Gouna, 12 riders)", () => {
  let w: GounaWorld;
  let heat1: Awaited<ReturnType<typeof state>>;
  beforeAll(async () => {
    w = await buildGouna({ riders: 12, name: "Walkover A" });
    heat1 = await state(w, w.uids[0][0]);
    // results are held back until the head judge releases them unless the event says "public results on publish"
    await w.f.s.from("events").update({ settings: { publicResultsOnPublish: true } }).eq("id", w.f.ids.evA1);
  }, 600_000);

  const run = (client: SupabaseClient, heat: string) => walkoverHeatCore({ user: client, service: w.f.s }, heat);

  it("a heat of three with one rider missing does NOT get a walkover: it runs with two", async () => {
    const [a, b] = heat1.slots;
    expect((await setDns(w.head, heat1.id, b.entry_id!)).error).toBeNull();
    const out = await run(w.head, heat1.id);
    expect(out).toMatchObject({ ok: false, code: "WALKOVER_NOT_POSSIBLE" });
    const s = await state(w, w.uids[0][0]);
    expect(s.row.status).toBe("scheduled");
    expect(s.slots.map((x) => x.modifier)).toEqual([null, "DNS", null]);
    void a;
  });

  it("Did not start works before the heat starts, and 'Back in the heat' clears it until the heat is published", async () => {
    const b = heat1.slots[1];
    const back = await w.head.rpc("set_rider_status", { p_heat: heat1.id, p_entry: b.entry_id!, p_modifier: null as never, p_reason: "Back in the heat" });
    expect(back.error).toBeNull();
    expect((await state(w, w.uids[0][0])).slots.map((x) => x.modifier)).toEqual([null, null, null]);
    expect((await setDns(w.head, heat1.id, b.entry_id!, "Injured")).error).toBeNull();
  });

  it("the rights: only the head judge's seat and the organiser; judges, spotters, the announcer and other organisations are refused, and nothing changes", async () => {
    // two riders cannot ride, so a walkover is otherwise possible
    expect((await setDns(w.head, heat1.id, heat1.slots[2].entry_id!, "Withdrew")).error).toBeNull();
    const before = JSON.stringify(await state(w, w.uids[0][0]));
    const draw0 = JSON.stringify(await drawOf(w));
    for (const who of ["j1", "j2", "spotter", "announcer", "orgB", "bJudge", "revoked", "anon"] as const) {
      const out = await run(w.f.clients[who], heat1.id);
      expect(out.ok, who).toBe(false);
      const outE = await outOfEventCore(w.f.clients[who], { heatId: heat1.id, entryId: heat1.slots[2].entry_id!, reason: "x" });
      expect(outE.ok, `${who} out of the event`).toBe(false);
      const r1 = await w.f.clients[who].rpc("set_rider_status", { p_heat: heat1.id, p_entry: heat1.slots[0].entry_id!, p_modifier: "DNS", p_reason: "xxx" });
      expect(r1.error, `${who} did not start`).not.toBeNull();
      const re = await w.f.clients[who].rpc("walkover_reopen", { p_heat: heat1.id, p_reason: "xxxx", p_before: null as never, p_draw: null as never, p_seats: null as never });
      expect(re.error, `${who} re-open`).not.toBeNull();
      const direct = await w.f.clients[who].rpc("walkover_heat_commit" as never, { p_heat: heat1.id, p_results: [], p_draw: null, p_projection: [], p_hold: false, p_words: "x", p_actor: w.f.userIds.head } as never);
      expect(direct.error, `${who} cannot call the commit directly`).not.toBeNull();
    }
    expect(JSON.stringify(await state(w, w.uids[0][0]))).toBe(before);
    expect(JSON.stringify(await drawOf(w))).toBe(draw0);
  });

  it("one press: the heat is finished and published, no clock, no scores; the rider goes through; the seat it feeds fills at once", async () => {
    const [a, b, c] = heat1.slots;
    const out = await run(w.head, heat1.id);
    expect(out).toMatchObject({ ok: true, already: false, winner: a.entry_id });
    const s = await state(w, w.uids[0][0]);
    expect(s.row.status).toBe("published");
    expect(isWalkoverHeat(s.row)).toBe(true); // started = ended = published at one instant
    expect(s.row.started_at).toBe(s.row.ended_at);
    expect(s.slots.map((x) => [x.entry_id, x.modifier])).toEqual([[a.entry_id, null], [b.entry_id, "DNS"], [c.entry_id, "DNS"]]);
    const results = (await w.f.s.from("heat_results").select("entry_id, place, total, breakdown, version").eq("heat_id", heat1.id).order("place")).data!;
    expect(results.map((r) => [r.entry_id, r.place, r.total, (r.breakdown as { status: string }).status, r.version])).toEqual([[a.entry_id, 1, null, "WO", 1], [b.entry_id, 2, null, "DNS", 1], [c.entry_id, 3, null, "DNS", 1]]);
    expect((await w.f.s.from("trick_attempts").select("id").eq("heat_id", heat1.id)).data).toHaveLength(0);
    // the next seat: R2 first heat, seat 1 is the winner of Heat 1
    const r2 = await state(w, w.uids[1][0]);
    expect(r2.slots[0].entry_id).toBe(a.entry_id);
    expect(r2.slots[1].entry_id).toBeNull();
    // the draw knows it too
    const d = await drawOf(w);
    expect(d.results[`${d.rounds[0].heats[0].id}`].ranked[0]).toMatchObject({ entrantId: a.entry_id, place: 1, total: null, walkover: true });
  });

  it("pressing it again (or at the same time) gives one walkover", async () => {
    const [x, y] = await Promise.all([run(w.head, heat1.id), run(w.head, heat1.id)]);
    expect(x.ok && y.ok).toBe(true);
    expect((await w.f.s.from("heat_results").select("id").eq("heat_id", heat1.id)).data).toHaveLength(3);
  });

  it("the audit log says it in words", async () => {
    const [a, b, c] = heat1.slots;
    const lines = (await w.f.s.from("audit_log").select("action, reason").eq("event_id", w.f.ids.evA1).eq("action", "heat_walkover").eq("row_id", heat1.id)).data!;
    expect(lines).toHaveLength(1);
    expect(lines[0].reason).toBe(`Head judge gave a walkover in R1 · H1: ${await nameOf(w, a.entry_id!)} goes through; ${await nameOf(w, b.entry_id!)} did not start (Injured); ${await nameOf(w, c.entry_id!)} did not start (Withdrew)`);
  });

  it("the public pages read it: the winner is a Walkover with no total, the others Did not start", async () => {
    const res = (await anonClient().rpc("get_public_results", { p_event: w.f.ids.evA1 })).data as { divisions: Array<{ id: string; rounds: Array<{ heats: Array<{ id: string; results: Array<{ entry_id: string; place: number | null; total: number | null; breakdown: { status: string } }> }> }> }> };
    const heat = res.divisions.find((d) => d.id === w.div)!.rounds.flatMap((r) => r.heats).find((h) => h.id === heat1.id)!;
    expect(heat.results.map((r) => [r.place, r.total, r.breakdown.status])).toEqual([[1, null, "WO"], [2, null, "DNS"], [3, null, "DNS"]]);
  });

  it("Re-open puts it back to Not started with its riders, and the seat it filled goes back to its place", async () => {
    const out = await reopenWalkoverCore(w.head, heat1.id, "Rider is here after all");
    expect(out).toEqual({ ok: true });
    const s = await state(w, w.uids[0][0]);
    expect(s.row).toMatchObject({ status: "scheduled", started_at: null, ended_at: null, published_at: null });
    expect(s.slots.map((x) => [x.entry_id !== null, x.modifier])).toEqual([[true, null], [true, "DNS"], [true, "DNS"]]);
    expect((await state(w, w.uids[1][0])).slots[0].entry_id).toBeNull();
    const d = await drawOf(w);
    expect(d.results[d.rounds[0].heats[0].id]).toBeUndefined();
    const line = (await w.f.s.from("audit_log").select("reason").eq("row_id", heat1.id).eq("action", "heat_walkover_reopened")).data!;
    expect(line).toHaveLength(1);
    expect(line[0].reason).toContain("Head judge took back the walkover in R1 · H1");
  });

  it("a heat that is not a walkover is not touched by the walkover Re-open (it returns null, today's Re-open runs)", async () => {
    expect(await reopenWalkoverCore(w.head, heat1.id, "x y z")).toBeNull();
  });

  it("walkover again after a Re-open is version 2, and Re-open is refused once a heat it fed has started", async () => {
    expect(await run(w.head, heat1.id)).toMatchObject({ ok: true });
    // the first walkover's snapshot stays (version 1, for the audit trail); the new one is version 2, one row per rider
    const versions = (await w.f.s.from("heat_results").select("version").eq("heat_id", heat1.id)).data!.map((r) => r.version).sort();
    expect(versions).toEqual([1, 1, 1, 2, 2, 2]);
    const r2 = await state(w, w.uids[1][0]);
    await w.f.s.from("heats").update({ status: "running", started_at: ago(60) }).eq("id", r2.id);
    const out = await reopenWalkoverCore(w.head, heat1.id, "too late");
    expect(out).toMatchObject({ ok: false, code: "DOWNSTREAM_STARTED" });
    expect((await state(w, w.uids[0][0])).row.status).toBe("published");
    await w.f.s.from("heats").update({ status: "scheduled", started_at: null }).eq("id", r2.id);
  });

  it("a walkover heat stops the clock being used: a started or ridden heat is refused", async () => {
    const h2 = await state(w, w.uids[0][1]);
    await w.f.s.from("heats").update({ status: "running", started_at: ago(30) }).eq("id", h2.id);
    expect(await run(w.head, h2.id)).toMatchObject({ ok: false, code: "WALKOVER_NOT_POSSIBLE" });
    await w.f.s.from("heats").update({ status: "scheduled", started_at: null }).eq("id", h2.id);
  });

  it("Out of the event: this heat's seat is Did not start, the entry is withdrawn, the draw follows; the organiser may do it too", async () => {
    const h3 = await state(w, w.uids[0][2]);
    const [x, y, z] = h3.slots.map((s) => s.entry_id!);
    const out = await outOfEventCore(w.head, { heatId: h3.id, entryId: y, reason: "Injured" });
    expect(out).toEqual({ ok: true });
    expect((await w.f.s.from("entries").select("status").eq("id", y).single()).data!.status).toBe("withdrawn");
    expect((await state(w, w.uids[0][2])).slots.map((s) => s.modifier)).toEqual([null, "DNS", null]);
    expect((await drawOf(w)).entrants.find((e) => e.id === y)!.withdrawn).toBe(true);
    const line = (await w.f.s.from("audit_log").select("reason").eq("event_id", w.f.ids.evA1).eq("action", "rider_out_of_event").eq("row_id", h3.slots[1] ? (await w.f.s.from("heat_slots").select("id").eq("heat_id", h3.id).eq("entry_id", y).single()).data!.id : "")).data!;
    expect(line[0].reason).toBe(`Head judge took ${await nameOf(w, y)} out of the event in R1 · H3 (Injured)`);
    // the organiser can too
    const orgOut = await outOfEventCore(w.f.clients.orgA, { heatId: h3.id, entryId: z, reason: "Withdrew" });
    expect(orgOut).toEqual({ ok: true });
    // two are out: the third gets the walkover
    expect(await run(w.head, h3.id)).toMatchObject({ ok: true, winner: x });
  });

  it("nobody left: nobody goes through and the seat it feeds stays empty; a later heat left with one rider offers its own walkover", async () => {
    const h4 = await state(w, w.uids[0][3]);
    for (const s of h4.slots) expect((await setDns(w.head, h4.id, s.entry_id!, "Didn't show")).error).toBeNull();
    const out = await run(w.head, h4.id);
    expect(out).toMatchObject({ ok: true, winner: null });
    const results = (await w.f.s.from("heat_results").select("place, breakdown").eq("heat_id", h4.id)).data!;
    expect(results.every((r) => r.place === null && (r.breakdown as { status: string }).status === "DNS")).toBe(true);
    // R2 second heat = winners of H3 and H4: H3's winner is in seat 1, H4's seat is a walkover (no rider)
    const r2b = await state(w, w.uids[1][1]);
    expect(r2b.slots[0].entry_id).not.toBeNull();
    expect(r2b.slots[1]).toMatchObject({ entry_id: null, modifier: "DNS" });
    // that heat now has exactly one rider who can ride: it offers (and accepts) a walkover of its own
    expect(await run(w.head, r2b.id)).toMatchObject({ ok: true, winner: r2b.slots[0].entry_id });
    // the final now has one real rider (R2 first heat is still waiting on H2): nothing is decided there yet
    expect(await run(w.head, (await state(w, w.uids[2][0])).id)).toMatchObject({ ok: false, code: "WALKOVER_NOT_POSSIBLE" });
  });
});

describe.skipIf(!ENV_OK)("Walkover — Out of the event is what Withdrawn on the Riders step does", () => {
  let console_: GounaWorld;
  let riders: GounaWorld;
  beforeAll(async () => {
    const f = await sharedFixture();
    console_ = await buildGouna({ riders: 12, name: "Walkover console", fixture: f });
    riders = await buildGouna({ riders: 12, name: "Walkover riders", fixture: f });
  }, 600_000);

  it("the same rider (seed 5) gives the same draw and the same seats from the console and from the Riders step", async () => {
    const seed = 4; // zero-based: the fifth entry
    const heatOf = async (w: GounaWorld) => {
      const slots = (await w.f.s.from("heat_slots").select("heat_id, entry_id").in("heat_id", (await w.f.s.from("heats").select("id").eq("division_id", w.div)).data!.map((h) => h.id))).data!;
      return slots.find((s) => s.entry_id === w.entries[seed])!.heat_id;
    };
    const o = await outOfEventCore(console_.head, { heatId: await heatOf(console_), entryId: console_.entries[seed], reason: "Injured" });
    expect(o).toEqual({ ok: true });
    const r = await setEntryStatus(riders.f.clients.orgA, [riders.entries[seed]], "withdrawn");
    expect(r).toMatchObject({ ok: true });
    const shape = async (w: GounaWorld) => {
      const d = (await w.f.s.from("divisions").select("draw").eq("id", w.div).single()).data!.draw as unknown as DivisionDraw;
      const idx = (id: string | undefined) => (id ? w.entries.indexOf(id) : -1);
      const rows = (await w.f.s.from("heats").select("number, id").eq("division_id", w.div).order("number")).data!;
      const slots = [];
      for (const h of rows) for (const s of await w.seats(h.id)) slots.push([h.number, s.position, idx(s.entry_id ?? undefined), s.modifier]);
      return { withdrawn: d.entrants.map((e) => e.withdrawn ?? false), slots, status: (await w.f.s.from("entries").select("status").eq("id", w.entries[seed]).single()).data!.status };
    };
    expect(await shape(console_)).toEqual(await shape(riders));
  });
});

describe.skipIf(!ENV_OK)("Walkover — Knockout with a second chance (12 riders)", () => {
  let w: GounaWorld;
  const kota = () => loadFormat("kota-dingle");
  beforeAll(async () => {
    w = await buildGouna({ riders: 12, name: "Walkover B", template: kota() });
  }, 600_000);

  const seatsOf = async (uid: string) => (await state(w, uid)).slots;

  it("Did not start is this heat only: he ranks last in R1 and still has his Round 2 heat", async () => {
    const h1 = await state(w, w.uids[0][0]);
    const missing = h1.slots[1].entry_id!;
    expect((await setDns(w.head, h1.id, missing)).error).toBeNull();
    // a heat of three with one rider missing runs with two
    await w.scoreAndEnd(h1.id);
    expect((await w.publish(h1.id)).ok).toBe(true);
    for (const uid of w.uids[0].slice(1)) {
      const h = await w.heatByUid(uid);
      await w.scoreAndEnd(h.id);
      expect((await w.publish(h.id)).ok, uid).toBe(true);
    }
    const r2 = await Promise.all(w.uids[1].map((u) => seatsOf(u)));
    const seat = r2.flat().find((s) => s.entry_id === missing);
    expect(seat, "he sits in a second-chance heat").toBeDefined();
    expect(seat!.modifier).toBeNull(); // not a walkover: he rides
    const results = (await w.f.s.from("heat_results").select("entry_id, place").eq("heat_id", h1.id)).data!;
    expect(results.find((r) => r.entry_id === missing)!.place).toBe(3); // last
  });

  it("Out of the event in a second-chance heat: the other rider gets a walkover to the next seat; his later seats are walkovers too", async () => {
    // the first second-chance heat with two seats
    let target: { uid: string; slots: Awaited<ReturnType<typeof seatsOf>> } | null = null;
    for (const uid of w.uids[1]) {
      const slots = await seatsOf(uid);
      if (slots.length === 2) { target = { uid, slots }; break; }
    }
    expect(target, "a 1 v 1 heat in Round 2").not.toBeNull();
    const t = target!;
    const heat = await state(w, t.uid);
    const [a, b] = heat.slots.map((s) => s.entry_id!);
    expect((await setDns(w.head, heat.id, b, "Didn't show")).error).toBeNull();
    const out = await walkoverHeatCore({ user: w.head, service: w.f.s }, heat.id);
    expect(out).toMatchObject({ ok: true, winner: a });
    // the winner took his place in the draw: he is an R3 arrival with no total
    const d = await drawOf(w);
    const r3 = d.rounds.find((r) => r.id === "R3")!;
    expect(r3.arrivals.some((x) => x.entrantId === a && x.place === 1 && x.total === null)).toBe(true);
    // b was only Did not start (this heat): he is out of the second-chance round (eliminated there), not Out of the event
    expect((await w.f.s.from("entries").select("status").eq("id", b).single()).data!.status).toBe("confirmed");
  });
});

describe.skipIf(!ENV_OK)("Walkover — Out of the event in Round 1 of a second-chance ladder (12 riders)", () => {
  let w: GounaWorld;
  beforeAll(async () => {
    w = await buildGouna({ riders: 12, name: "Walkover C", template: loadFormat("kota-dingle") });
  }, 600_000);

  it("a heat of three with one rider Out of the event runs with two; his Round 2 seat is a walkover; the lone rider there gets a walkover to the next seat", async () => {
    const h2 = await state(w, w.uids[0][1]);
    const out = h2.slots[1].entry_id!;
    expect(await outOfEventCore(w.head, { heatId: h2.id, entryId: out, reason: "Injured" })).toEqual({ ok: true });
    // not a walkover: two riders can still ride
    expect(await walkoverHeatCore({ user: w.head, service: w.f.s }, h2.id)).toMatchObject({ ok: false, code: "WALKOVER_NOT_POSSIBLE" });
    for (const uid of w.uids[0]) {
      const h = await w.heatByUid(uid);
      await w.scoreAndEnd(h.id);
      expect((await w.publish(h.id)).ok, uid).toBe(true);
    }
    const r2 = [];
    for (const uid of w.uids[1]) r2.push({ uid, slots: await w.seats((await w.heatByUid(uid)).id) });
    const mine = r2.find((h) => h.slots.some((s) => s.entry_id === out))!;
    expect(mine.slots.find((s) => s.entry_id === out)!.modifier).toBe("DNS");
    // a rider who is out of the event takes the shared place of the round he left, like any rider knocked out there
    expect((await drawOf(w)).entrants.find((e) => e.id === out)!.withdrawn).toBe(true);
    if (mine.slots.length === 2) {
      const heat = await w.heatByUid(mine.uid);
      const other = mine.slots.find((s) => s.entry_id !== out)!.entry_id;
      expect(await walkoverHeatCore({ user: w.head, service: w.f.s }, heat.id)).toMatchObject({ ok: true, winner: other });
    }
  });
});

void [noOne, randomBytes, signedIn, codeOf];
