import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { key } from "./live-helpers";
import { mkLadder, publishLadderHeat, type Ladder } from "./public-helpers";

// RA1 (0.26.0): Rider reports. What the report's read answers, to whom, and when. Hosted development project, throwaway organisation only (the fixture's); no real event is touched.
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SECRET_TEXT = "SECRET-RAW-TEXT-zq81";
const JUDGE_MARK = 8.77;

describe.skipIf(!ENV_OK)("RA1: the rider report's read (hosted development project)", () => {
  let f: Fixture;
  let shown: Ladder; // R1-H1 published and released
  let held: Ladder; // R1-H1 published but held back
  let waiting: Ladder; // nothing published
  let adult: string;
  let minor: string;
  let noDob: string;
  const ev = () => f.ids.evA1;
  const setting = async (value: string | null) => {
    const { data } = await f.s.from("events").select("settings").eq("id", ev()).single();
    const next = { ...((data?.settings as J) ?? {}) };
    if (value === null) delete next.riderReports;
    else next.riderReports = value;
    const { error } = await f.s.from("events").update({ settings: next as never }).eq("id", ev());
    if (error) throw new Error(error.message);
  };
  const status = async (s: string) => {
    const { error } = await f.s.from("events").update({ status: s }).eq("id", ev());
    if (error) throw new Error(error.message);
  };
  const read = async (c = f.clients.anon): Promise<J> => {
    const { data, error } = await c.rpc("get_rider_report", { p_event: ev() });
    if (error) throw new Error(error.message);
    return data as J;
  };
  const preview = async (c: Fixture["clients"][keyof Fixture["clients"]]) => c.rpc("preview_rider_report", { p_event: ev() });
  const heatIds = (res: J): string[] => res.divisions.flatMap((d: J) => d.rounds.flatMap((r: J) => r.heats.map((h: J) => h.id)));

  async function addAttempts(l: Ladder, uid: string) {
    const heat = l.heats[uid];
    const rows = (await f.s.from("heat_slots").select("entry_id").eq("heat_id", heat)).data ?? [];
    for (const [i, r] of rows.entries()) {
      for (const seq of [1, 2]) {
        const { data, error } = await f.s
          .from("trick_attempts")
          .insert({
            event_id: ev(), heat_id: heat, entry_id: r.entry_id, seq, status: seq === 1 ? "landed" : "crashed", client_key: key(), direction: "left", trick_name: seq === 1 ? "IN Backroll" : "IN Megaloop",
            trick_parts: { direction: "left", items: [{ id: "base:backroll" }], needsReview: false } as never, category_key: "rotation", raw_text: SECRET_TEXT, input_method: "text",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        if (i === 0 && seq === 1) {
          const { error: e2 } = await f.s.from("trick_scores").insert({ event_id: ev(), heat_id: heat, attempt_id: data!.id, judge_seat_id: f.ids.seat_j1, score: JUDGE_MARK, criteria: {} as never, client_key: key(), client_rev: 1 });
          if (e2) throw new Error(e2.message);
        }
      }
    }
  }

  beforeAll(async () => {
    f = await buildFixture();
    shown = await mkLadder(f, { name: "RR shown" });
    held = await mkLadder(f, { name: "RR held" });
    waiting = await mkLadder(f, { name: "RR waiting" });
    await publishLadderHeat(f, shown, "R1-H1");
    await publishLadderHeat(f, held, "R1-H1", { hold: true });
    for (const [l, uid] of [[shown, "R1-H1"], [held, "R1-H1"], [waiting, "R1-H1"]] as const) await addAttempts(l, uid);
    // the riders of the shown heat: one adult, one under 18, one without a date of birth
    const heatEntries = (await f.s.from("heat_slots").select("entry_id").eq("heat_id", shown.heats["R1-H1"]).order("position")).data!.map((r) => r.entry_id as string);
    const riderOf = async (entry: string) => (await f.s.from("entries").select("rider_id").eq("id", entry).single()).data!.rider_id as string;
    [adult, minor, noDob] = heatEntries;
    await f.s.from("riders").update({ dob: "1990-03-04", email: "adult@private.example.com", phone: "+20100PRIVATE" }).eq("id", await riderOf(adult));
    await f.s.from("riders").update({ dob: "2012-05-06", email: "minor@private.example.com" }).eq("id", await riderOf(minor));
    await f.s.from("riders").update({ email: "nodob@private.example.com" }).eq("id", await riderOf(noDob));
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("Off is the default: with the key missing a visitor gets nothing, not even that there are results", async () => {
    await setting(null);
    expect(await read()).toEqual({ allowed: false });
    await setting("off");
    expect(await read()).toEqual({ allowed: false });
    expect(await read(f.clients.j1)).toEqual({ allowed: false });
  });

  it("an unknown value of the setting is the same as Off", async () => {
    await setting("sometimes");
    expect(await read()).toEqual({ allowed: false });
  });

  it("'After each heat' returns nothing until a heat is published and released", async () => {
    await f.s.from("heats").update({ publish_hold: true }).eq("id", shown.heats["R1-H1"]);
    await setting("after_heat");
    expect(await read()).toEqual({ allowed: false });
    await f.s.from("heats").update({ publish_hold: false }).eq("id", shown.heats["R1-H1"]);
    const res = await read();
    expect(res.allowed).toBe(true);
    expect(res.how).toBe("after_heat");
  });

  it("only published, released heats are in the answer: not a held one, not one that never ran", async () => {
    await setting("after_heat");
    const ids = heatIds(await read());
    expect(ids).toContain(shown.heats["R1-H1"]);
    expect(ids).not.toContain(held.heats["R1-H1"]);
    for (const uid of Object.keys(waiting.heats)) expect(ids).not.toContain(waiting.heats[uid]);
    expect(ids).not.toContain(shown.heats["R2-H1"]);
  });

  it("'When the event is complete' returns nothing until the event is marked complete", async () => {
    await setting("after_event");
    expect(await read()).toEqual({ allowed: false });
    await status("complete");
    const res = await read();
    expect(res.allowed).toBe(true);
    expect(res.how).toBe("after_event");
    await status("published");
    expect(await read()).toEqual({ allowed: false });
  });

  it("a draft event answers nothing whatever the setting says", async () => {
    await setting("after_heat");
    await status("draft");
    expect(await read()).toEqual({ allowed: false });
    await status("published");
  });

  it("never a judge's mark, a judge's name, the reference hints, the spotter's raw text or a contact detail, for a visitor and for a signed-in seat", async () => {
    await setting("after_heat");
    for (const c of [f.clients.anon, f.clients.j1, f.clients.head, f.clients.spotter, f.clients.orgB]) {
      const res = await read(c);
      expect(res.allowed).toBe(true);
      const text = JSON.stringify(res);
      for (const bad of [String(JUDGE_MARK), "9.9", "judgeScores", "judgeId", "missedBy", "outlier", "Judge 1", "J1", SECRET_TEXT, "private.example.com", "+20100PRIVATE", "raw_text", "dob", "1990-03-04", "2012-05-06", "judge_seat", "seat_no"]) {
        expect(text, `${bad} must not be in the answer`).not.toContain(bad);
      }
      // no key at all that names a hint, a pending row or a flag
      const keys = new Set<string>();
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
      };
      walk(res);
      for (const k of keys) expect(k, "a key that names a hint, a pending row or a flag").not.toMatch(/ref|hint|pending|flag|note|email|phone|judge/i);
    }
  });

  it("what is there: the published figures and the spotter's line, the side, and a time in the heat", async () => {
    await setting("after_heat");
    const res = await read();
    const heat = res.divisions.flatMap((d: J) => d.rounds.flatMap((r: J) => r.heats)).find((h: J) => h.id === shown.heats["R1-H1"]);
    const mine = heat.results.find((r: J) => r.entry_id === adult);
    expect(mine.attempts).toHaveLength(2);
    expect(mine.attempts[0]).toMatchObject({ seq: 1, status: "landed", direction: "left", trick: "IN Backroll" });
    expect(typeof mine.attempts[0].score).toBe("number");
    expect(typeof mine.attempts[0].at_sec).toBe("number");
    expect(mine.attempts[1]).toMatchObject({ status: "crashed", score: null });
    expect(res.blocks.length).toBeGreaterThan(0);
  });

  it("a record that says under 18 is marked, an adult or a record with no date is not; the date itself never leaves", async () => {
    await setting("after_heat");
    const res = await read();
    const flag = (id: string) => res.entries.find((e: J) => e.id === id).report_withheld;
    expect(flag(minor)).toBe(true);
    expect(flag(adult)).toBe(false);
    expect(flag(noDob)).toBe(false);
    expect(Object.keys(res.entries[0]).sort()).toEqual(["division_id", "first_name", "id", "last_name", "nationality", "report_withheld", "withdrawn"]);
  });

  it("the organiser's preview works while the setting is Off; a visitor, a seat and another organisation's organiser are refused", async () => {
    await setting("off");
    const mine = await preview(f.clients.orgA);
    expect(mine.error).toBeNull();
    expect((mine.data as J).allowed).toBe(true);
    expect((mine.data as J).how).toBe("preview");
    for (const c of [f.clients.anon, f.clients.j1, f.clients.head, f.clients.spotter, f.clients.orgB]) {
      const r = await preview(c);
      if (r.error) expect(r.error.message).toBeTruthy();
      else expect(r.data).toEqual({ allowed: false });
    }
  });

  it("the preview shows no more than a report does: still no held heat, no judge mark", async () => {
    await setting("off");
    const res = (await preview(f.clients.orgA)).data as J;
    expect(heatIds(res)).not.toContain(held.heats["R1-H1"]);
    const text = JSON.stringify(res);
    for (const bad of [String(JUDGE_MARK), "judgeScores", "missedBy", SECRET_TEXT, "private.example.com"]) expect(text).not.toContain(bad);
  });

  it("the helper functions behind the read cannot be called directly by a visitor or a signed-in seat", async () => {
    for (const c of [f.clients.anon, f.clients.j1]) {
      const r = await c.rpc("rider_report_payload" as never, { p_event: ev(), p_how: "x" } as never);
      expect(r.error).not.toBeNull();
    }
  });
});
