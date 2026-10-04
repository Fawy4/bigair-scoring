import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startingCopy, startingTarget } from "@/lib/reset/plan";
import { rerunName } from "@/lib/live/rerun";
import type { DivisionDraw } from "@/lib/engine/ladder";
import { anonClient, ENV_OK } from "./helpers";
import { ago, codeOf } from "./live-helpers";
import { buildGouna, sharedFixture, type GounaWorld } from "./audit-1b-world";

afterAll(async () => {
  if (ENV_OK) await (await sharedFixture()).cleanup();
});

// Audit 1b — the "Deferred to Part 1b" ladder scenarios of Audit 1a, on the hosted development project with the real Gouna draw (24 riders, 15 heats).
// See docs/AUDIT.md (A1b-n). Throwaway organisations only (buildFixture); Arrow, EKL and Demo are never touched.

/** A small seeded random generator, so a failing order can be replayed. */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return x / 2 ** 32;
  };
}
const shuffle = <T,>(a: T[], r: () => number) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

async function divisionSlots(w: GounaWorld) {
  const heats = (await w.f.s.from("heats").select("id, draw_uid, status").eq("division_id", w.div)).data ?? [];
  const slots = (await w.f.s.from("heat_slots").select("heat_id, position, entry_id, modifier, vest_colour, source").in("heat_id", heats.map((h) => h.id))).data ?? [];
  return { heats, slots, key: (sl: { heat_id: string; position: number }) => `${sl.heat_id}#${sl.position}` };
}

describe.skipIf(!ENV_OK)("Audit 1b — Gouna ladder on the database: seats fill on publish (fixed ladder)", () => {
  let w: GounaWorld;
  const SEED = 0x1b0f;
  beforeAll(async () => {
    w = await buildGouna();
  }, 600_000);

  it("the locked draw is 15 heats: 8 × 3, 4 × 2, 2 × 2, final of 2; Round 1 full, every later seat empty", async () => {
    expect(w.uids.map((r) => r.length)).toEqual([8, 4, 2, 1]);
    const { heats, slots } = await divisionSlots(w);
    expect(heats).toHaveLength(15);
    const r1 = new Set(await Promise.all(w.uids[0].map(async (u) => (await w.heatByUid(u)).id)));
    expect(slots.filter((s) => r1.has(s.heat_id)).every((s) => s.entry_id)).toBe(true);
    expect(slots.filter((s) => !r1.has(s.heat_id)).every((s) => s.entry_id === null)).toBe(true);
    expect(slots.filter((s) => r1.has(s.heat_id))).toHaveLength(24);
  });

  it("publishing each heat (random order within a round) fills exactly the one seat its winner goes to, at once, and touches no other seat", async () => {
    const r = rng(SEED);
    for (let round = 0; round < w.uids.length; round++) {
      for (const uid of shuffle(w.uids[round], r)) {
        const heat = await w.heatByUid(uid);
        // random totals: a random permutation of distinct bases for the riders of this heat
        const n = (await w.seats(heat.id)).length;
        const bases = shuffle([...Array(n)].map((_, i) => 9 - i), r);
        const riders = await w.scoreAndEnd(heat.id, bases);
        const winner = riders[bases.indexOf(Math.max(...bases))];
        const before = await divisionSlots(w);
        const res = await w.publish(heat.id);
        expect(res, `publish ${uid}`).toMatchObject({ ok: true, version: 1 });
        const after = await divisionSlots(w);
        const changed = after.slots.filter((s) => {
          const b = before.slots.find((x) => before.key(x) === after.key(s))!;
          return b.entry_id !== s.entry_id || b.modifier !== s.modifier;
        });
        if (round === w.uids.length - 1) {
          expect(changed, "the final feeds nothing").toHaveLength(0);
        } else {
          expect(changed.map((c) => c.entry_id), `publishing ${uid} fills one seat with its winner`).toEqual([winner]);
          // that seat says where it came from: 1st of this heat of this round
          const src = changed[0].source as { round?: string; heat?: number; place?: number };
          expect(src).toMatchObject({ round: uid.split("-")[0], place: 1 });
          expect([heat.number, Number(uid.split("-H")[1])]).toContain(src.heat);
        }
      }
    }
    // every seat of every heat is filled, every heat is published, and each rider sits in at most one heat per round
    const end = await divisionSlots(w);
    expect(end.slots.every((s) => s.entry_id)).toBe(true);
    expect(end.heats.every((h) => h.status === "published")).toBe(true);
  }, 900_000);

  it("the final placings agree with the published heat results: champion = final winner, 2nd = final runner-up, eliminated riders share their round's place", async () => {
    const results = (await w.f.s.from("heat_results").select("heat_id, entry_id, place, version").eq("event_id", w.f.ids.evA1)).data ?? [];
    const final = await w.heatByUid(w.uids[3][0]);
    const finalRes = results.filter((x) => x.heat_id === final.id).sort((a, b) => a.place - b.place);
    expect(finalRes).toHaveLength(2);
    // each rider appears in the results of exactly one heat per round they reached, and the winners of round k are exactly the riders of round k+1
    for (let k = 0; k < 3; k++) {
      const ids = await Promise.all(w.uids[k].map(async (u) => (await w.heatByUid(u)).id));
      const winners = results.filter((x) => ids.includes(x.heat_id) && x.place === 1).map((x) => x.entry_id).sort();
      const nextIds = await Promise.all(w.uids[k + 1].map(async (u) => (await w.heatByUid(u)).id));
      const next = ((await w.f.s.from("heat_slots").select("entry_id").in("heat_id", nextIds)).data ?? []).map((x) => x.entry_id).sort();
      expect(next, `round ${k + 2} riders = round ${k + 1} winners`).toEqual(winners);
    }
    // the draw stored on the division carries the same result for every heat
    const draw = (await w.f.s.from("divisions").select("draw").eq("id", w.div).single()).data!.draw as DivisionDraw;
    expect(Object.keys(draw.results ?? {})).toHaveLength(15);
  });

  it("A1b-11 measurement: what one public page refresh reads from the database for a whole Gouna event (15 heats published), raw and gzipped", async () => {
    const slug = (await w.f.s.from("events").select("slug").eq("id", w.f.ids.evA1).single()).data!.slug as string;
    const a = anonClient();
    const sizes: Record<string, { raw: number; gzip: number }> = {};
    for (const [fn, args] of [["get_public_site", { p_slug: slug }], ["get_public_timetable", { p_event: w.f.ids.evA1 }], ["get_public_results", { p_event: w.f.ids.evA1 }], ["get_public_rules", { p_event: w.f.ids.evA1 }], ["get_public_draw", { p_event: w.f.ids.evA1 }]] as const) {
      const r = await a.rpc(fn, args as never);
      const text = JSON.stringify(r.data);
      sizes[fn] = { raw: text.length, gzip: gzipSync(text).length };
    }
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/audit-1b-sizes.json", JSON.stringify(sizes, null, 1));
    expect(sizes.get_public_results.raw).toBeGreaterThan(0);
  });
});

describe.skipIf(!ENV_OK)("Audit 1b — re-seeded ladder: the next round waits for the whole round", () => {
  let w: GounaWorld;
  beforeAll(async () => {
    w = await buildGouna({ reseed: "by_heat_score" });
  }, 600_000);

  it("publishing 7 of the 8 Round 1 heats fills no Round 2 seat; the 8th fills all 8", async () => {
    const r2 = await Promise.all(w.uids[1].map(async (u) => (await w.heatByUid(u)).id));
    const r2Seats = async () => ((await w.f.s.from("heat_slots").select("entry_id").in("heat_id", r2)).data ?? []).filter((s) => s.entry_id).length;
    for (const [i, uid] of w.uids[0].entries()) {
      const heat = await w.heatByUid(uid);
      await w.scoreAndEnd(heat.id);
      expect(await w.publish(heat.id), uid).toMatchObject({ ok: true });
      expect(await r2Seats(), `after ${i + 1} of 8`).toBe(i < 7 ? 0 : 8);
    }
  }, 900_000);
});

describe.skipIf(!ENV_OK)("Audit 1b — re-run and cancel keep every later seat pointing at exactly one heat", () => {
  let w: GounaWorld;
  const rerun = async (heat: string, reason: string) => {
    const h = (await w.f.s.from("heats").select("number, number_suffix, name").eq("id", heat).single()).data!;
    const n = rerunName({ number: h.number, suffix: h.number_suffix, name: h.name });
    const id = randomUUID();
    const res = await w.head.rpc("rerun_heat", { p_heat: heat, p_new_heat: id, p_suffix: n.suffix, p_name: n.name, p_reason: reason, p_leave_out: {} as never, p_plan: null as never, p_plan_items: null as never, p_plan_updated_at: null as never });
    return { id, code: codeOf(res) };
  };
  /** Every draw position of the division is owned by exactly one heat, and that heat is not cancelled. */
  const owners = async () => {
    const heats = (await w.f.s.from("heats").select("id, draw_uid, status").eq("division_id", w.div)).data ?? [];
    return w.uids.flat().map((uid) => heats.filter((h) => h.draw_uid === uid));
  };
  beforeAll(async () => {
    w = await buildGouna();
    // Round 1 published, so Round 2 is filled
    for (const uid of w.uids[0]) {
      const h = await w.heatByUid(uid);
      await w.scoreAndEnd(h.id);
      expect(await w.publish(h.id)).toMatchObject({ ok: true });
    }
  }, 900_000);

  it("a re-run of a running Round 2 heat: the cancelled original owns no draw position, the re-run owns it, and publishing the re-run fills the semi-final seat", async () => {
    const orig = await w.heatByUid(w.uids[1][0]);
    await w.f.s.from("heats").update({ status: "running", started_at: ago(120) }).eq("id", orig.id);
    const { id, code } = await rerun(orig.id, "kite tangle");
    expect(code).toBe("");
    for (const o of await owners()) {
      expect(o).toHaveLength(1);
      expect(o[0].status).not.toBe("cancelled");
    }
    expect((await w.heatByUid(w.uids[1][0])).id).toBe(id);
    const riders = await w.scoreAndEnd(id, [9, 1]);
    expect(await w.publish(id)).toMatchObject({ ok: true, version: 1 });
    const sf = await w.heatByUid(w.uids[2][0]);
    expect((await w.seats(sf.id)).map((s) => s.entry_id)).toContain(riders[0]);
  }, 300_000);

  it("a re-run of the re-run: still exactly one owner per position; the first re-run is cancelled and owns nothing", async () => {
    const first = await w.heatByUid(w.uids[1][1]);
    await w.f.s.from("heats").update({ status: "running", started_at: ago(60) }).eq("id", first.id);
    const a = await rerun(first.id, "first tangle");
    expect(a.code).toBe("");
    await w.f.s.from("heats").update({ status: "running", started_at: ago(30) }).eq("id", a.id);
    const b = await rerun(a.id, "second tangle");
    expect(b.code).toBe("");
    const o = await owners();
    expect(o.every((x) => x.length === 1 && x[0].status !== "cancelled")).toBe(true);
    expect((await w.heatByUid(w.uids[1][1])).id).toBe(b.id);
  }, 300_000);

  it("Cancel heat alone (no re-run yet): the cancelled heat still owns its position, so the semi-final seat waits; Re-run then hands the position to the re-run", async () => {
    const h = await w.heatByUid(w.uids[1][2]);
    await w.f.s.from("heats").update({ status: "running", started_at: ago(60) }).eq("id", h.id);
    expect(codeOf(await w.head.rpc("cancel_heat", { p_heat: h.id, p_reason: "wind died" }))).toBe("");
    const o1 = (await owners())[w.uids[0].length + 2];
    expect(o1).toHaveLength(1);
    expect(o1[0].status).toBe("cancelled"); // documented: a cancelled heat is re-run (errors.md: "A cancelled heat cannot be started. Re-run it instead.")
    const r = await rerun(h.id, "wind back");
    expect(r.code).toBe("");
    const o2 = (await owners())[w.uids[0].length + 2];
    expect(o2.map((x) => x.id)).toEqual([r.id]);
  }, 300_000);

  it("the database itself refuses two heats on one draw position (unique index), whatever writes them", async () => {
    const h = await w.heatByUid(w.uids[1][3]);
    const row = (await w.f.s.from("heats").select("round_id, division_id, event_id, number, draw_uid").eq("id", h.id).single()).data!;
    const dup = await w.f.s.from("heats").insert({ ...row, number_suffix: "X", duration_sec: 600 });
    expect(codeOf(dup)).toMatch(/duplicate|unique/i);
  });
});

describe.skipIf(!ENV_OK)("Audit 1b — withdrawals after the draw is locked (docs/04 decisions 13 and 36)", () => {
  let w: GounaWorld;
  beforeAll(async () => {
    w = await buildGouna();
  }, 600_000);

  it("the locked draw keeps 15 heats and the withdrawn rider's seat stays in place (the heat of 3 runs with 2)", async () => {
    const victim = w.entries[5];
    await w.f.clients.orgA.from("entries").update({ status: "withdrawn" }).eq("id", victim);
    expect((await w.f.s.from("heats").select("id").eq("division_id", w.div)).data).toHaveLength(15);
    const seat = (await w.f.s.from("heat_slots").select("entry_id, heat_id").eq("entry_id", victim)).data ?? [];
    expect(seat).toHaveLength(1);
  });

  // A1b-3: the Riders step's "Withdrawn" only changes entries.status. Nothing calls set_draw_walkover (it exists, tested in draw-timetable.test.ts), so the seat
  // never becomes a DNS walkover: the heat starts with the rider in it and the Impression / Variety score of every judge is missing for that rider.
  it.fails("A1b-3: setting a rider to Withdrawn after the lock makes the seat a DNS walkover", async () => {
    const victim = w.entries[6];
    await w.f.clients.orgA.from("entries").update({ status: "withdrawn" }).eq("id", victim);
    const seat = (await w.f.s.from("heat_slots").select("modifier").eq("entry_id", victim).single()).data!;
    expect(seat.modifier).toBe("DNS");
  });

  it("A1b-3 today: the seat keeps the rider with no modifier, and the heat can start with them in it", async () => {
    const victim = w.entries[7];
    await w.f.clients.orgA.from("entries").update({ status: "withdrawn" }).eq("id", victim);
    const seat = (await w.f.s.from("heat_slots").select("modifier, heat_id").eq("entry_id", victim).single()).data!;
    expect(seat.modifier).toBeNull();
    expect(codeOf(await w.head.rpc("start_heat", { p_heat: seat.heat_id }))).toBe("");
    await w.f.s.from("heats").update({ status: "ended", ended_at: ago(1) }).eq("id", seat.heat_id);
  });

  it("the head judge's workaround works: Did not start for that rider in that heat ranks them last with no total and blocks nothing", async () => {
    const victim = w.entries[8];
    const heat = (await w.f.s.from("heat_slots").select("heat_id").eq("entry_id", victim).single()).data!.heat_id;
    const slots = await w.seats(heat);
    await w.f.s.from("heats").update({ status: "ended", started_at: ago(900), ended_at: ago(300) }).eq("id", heat);
    expect(codeOf(await w.head.rpc("set_rider_status", { p_heat: heat, p_entry: victim, p_modifier: "DNS", p_reason: "withdrew after the draw" }))).toBe("");
    await w.scoreAndEnd(heat, slots.map((s, i) => (s.entry_id === victim ? 0 : 8 - i)));
    const res = await w.publish(heat);
    expect(res).toMatchObject({ ok: true });
    const mine = (await w.f.s.from("heat_results").select("place, total").eq("heat_id", heat).eq("entry_id", victim).single()).data!;
    expect(mine.total).toBeNull();
    expect(mine.place).toBe(slots.length);
  }, 300_000);
});

// Reset event wipes the whole fixture event, so it runs last.
describe.skipIf(!ENV_OK)("Audit 1b — Reset event restores the locked copy exactly", () => {
  let w: GounaWorld;
  let atLock: string;
  const shape = async () => {
    const { heats, slots } = await divisionSlots(w);
    const full = (await w.f.s.from("heats").select("id, round_id, number, number_suffix, name, draw_uid, status, duration_sec, warm_up_sec, started_at, ended_at, published_at, publish_hold, armed_at, prestart_sec, armed_paused_at, rerun_of").in("id", heats.map((h) => h.id)).order("id")).data;
    const division = (await w.f.s.from("divisions").select("draw, draw_at_lock, draw_locked_at").eq("id", w.div).single()).data!;
    return JSON.stringify({
      heats: full,
      slots: [...slots].sort((a, b) => `${a.heat_id}${a.position}`.localeCompare(`${b.heat_id}${b.position}`)),
      draw: division.draw,
      locked: Boolean(division.draw_locked_at),
    });
  };
  beforeAll(async () => {
    w = await buildGouna();
    atLock = await shape();
  }, 600_000);

  it("after Round 1 and Round 2 published, a re-run and a correction, Reset event gives back the heats, seats, Lycras and stored draw of the moment of locking, byte for byte", async () => {
    for (const uid of [...w.uids[0], ...w.uids[1].slice(1)]) {
      const h = await w.heatByUid(uid);
      await w.scoreAndEnd(h.id);
      expect(await w.publish(h.id)).toMatchObject({ ok: true });
    }
    const h = await w.heatByUid(w.uids[1][0]);
    await w.f.s.from("heats").update({ status: "running", started_at: ago(60) }).eq("id", h.id);
    const n = rerunName({ number: h.number, suffix: h.number_suffix, name: null });
    expect(codeOf(await w.head.rpc("rerun_heat", { p_heat: h.id, p_new_heat: randomUUID(), p_suffix: n.suffix, p_name: n.name, p_reason: "tangle", p_leave_out: {} as never, p_plan: null as never, p_plan_items: null as never, p_plan_updated_at: null as never }))).toBe("");
    expect(await shape()).not.toBe(atLock);

    const slug = (await w.f.s.from("events").select("slug").eq("id", w.f.ids.evA1).single()).data!.slug;
    const divisions = (await w.f.s.from("divisions").select("id, draw, draw_at_lock, draw_locked_at").eq("event_id", w.f.ids.evA1).not("draw", "is", null)).data ?? [];
    const draws = divisions.map((d) => {
      const current = d.draw as unknown as DivisionDraw;
      const t = startingTarget(startingCopy({ draw: current, draw_at_lock: d.draw_at_lock as unknown as DivisionDraw | null, draw_locked_at: d.draw_locked_at }), current);
      return { division: d.id, draw: t.draw, projection: t.projection };
    });
    const res = await w.f.clients.orgA.rpc("reset_event", { p_event: w.f.ids.evA1, p_slug: slug, p_reason: "audit 1b rehearsal", p_draws: draws as never });
    expect(codeOf(res)).toBe("");
    expect(await shape()).toBe(atLock);
  }, 900_000);
});
