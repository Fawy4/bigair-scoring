import { describe, expect, it } from "vitest";
import { expandFormat, lockDraw } from "@/lib/engine/ladder";
import { loadFormat, makeEntrants, publishRound } from "@/lib/engine/ladder/fixtures";
import { drawProjection } from "@/lib/draw/projection";
import { copyProblems, everPublic, resetTarget, type HeatFacts } from "./plan";

// docs/PLAN-phase-7a.md step 8d, tests first. The decision itself is made inside the database function (tests/rls/reset.test.ts); this file is the rule in words.
const kota = () => lockDraw(expandFormat(loadFormat("kota-dingle"), makeEntrants(18)));

describe("what Reset puts the ladder back to", () => {
  it("the projection of a KOTA 18-rider ladder after three published heats equals the projection of its draw at lock time: Round 1 keeps its riders, later seats are placeholders", () => {
    const locked = kota();
    const played = publishRound(locked, "R1");
    expect(drawProjection(played)).not.toEqual(drawProjection(locked)); // later rounds were filled by the results
    const target = resetTarget(locked);
    expect(target.projection).toEqual(drawProjection(locked));
    const r1 = target.projection.heats.filter((h) => h.round_key === "R1");
    expect(r1).toHaveLength(6);
    expect(r1.every((h) => h.slots.every((s) => s.entry_id !== null))).toBe(true);
    // the same Round 1 seats as the played ladder had
    expect(r1).toEqual(drawProjection(played).heats.filter((h) => h.round_key === "R1"));
    const later = target.projection.heats.filter((h) => h.round_key !== "R1");
    expect(later).toHaveLength(9);
    expect(later.every((h) => h.slots.every((s) => s.entry_id === null && s.source !== null))).toBe(true);
  });

  it("the target is a locked draw with no results, and the copy is not changed", () => {
    const locked = kota();
    const before = JSON.stringify(locked);
    const t = resetTarget(locked);
    expect(t.draw.status).toBe("locked");
    expect(t.draw.results).toEqual({});
    expect(JSON.stringify(locked)).toBe(before);
  });

  it("a copy that already holds results is refused, never guessed (a lock taken after heats ran)", () => {
    const played = publishRound(kota(), "R1");
    expect(() => resetTarget(played)).toThrow(/starting draw/i);
  });
});

describe("a division locked without a copy is reported, not guessed", () => {
  const d = (over: object) => ({ name: "Pro Men", drawn: true, hasCopy: false, heatLeftScheduled: false, ...over });
  it("no heat has started: unlock and lock the draw again first", () => {
    expect(copyProblems([d({})])).toEqual(["Pro Men: unlock and lock the draw again first"]);
  });
  it("a heat has started: its starting draw is not known", () => {
    expect(copyProblems([d({ heatLeftScheduled: true })])).toEqual(["Pro Men was locked before Reset existed (or re-locked after its first heat), so its starting draw is not known and it cannot be reset."]);
  });
  it("a division with a copy, or without a draw, is fine", () => {
    expect(copyProblems([d({ hasCopy: true }), d({ name: "Women", drawn: false })])).toEqual([]);
  });
});

describe("was a result ever shown publicly?", () => {
  const h = (over: Partial<HeatFacts>): HeatFacts => ({ hasResults: false, heldNow: false, everReleased: false, started: false, publicLive: null, liveSettingOn: false, ...over });
  it("published and not held: yes", () => expect(everPublic([h({ hasResults: true })])).toBe(true));
  it("published, held and never released: no", () => expect(everPublic([h({ hasResults: true, heldNow: true })])).toBe(false));
  it("held, then released: yes", () => expect(everPublic([h({ hasResults: true, heldNow: false, everReleased: true })])).toBe(true));
  it("released and held again: yes (it was public once)", () => expect(everPublic([h({ hasResults: true, heldNow: true, everReleased: true })])).toBe(true));
  it("live scores on while the heat ran (the heat's own switch, or the setting): yes", () => {
    expect(everPublic([h({ started: true, publicLive: true })])).toBe(true);
    expect(everPublic([h({ started: true, publicLive: null, liveSettingOn: true })])).toBe(true);
  });
  it("the heat's own switch off beats the setting", () => expect(everPublic([h({ started: true, publicLive: false, liveSettingOn: true })])).toBe(false));
  it("a heat that never started shows nothing live", () => expect(everPublic([h({ started: false, publicLive: true })])).toBe(false));
  it("nothing published and live scores off: no", () => expect(everPublic([h({ started: true }), h({})])).toBe(false));
  it("one public heat among many is enough", () => expect(everPublic([h({}), h({ hasResults: true })])).toBe(true));
});
