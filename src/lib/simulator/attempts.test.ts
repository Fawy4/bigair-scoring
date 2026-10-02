import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import { buildTrickVocab, type VocabularyInput } from "@/lib/engine/tricks";
import { attemptsDue, planAttempt, type AttemptPlan, type SpotterRider } from "./attempts";

const vocab = buildTrickVocab(vocabularyJson as unknown as VocabularyInput);
const all = vocab.blocks.map((b) => b.id);
const fresh = (id = "r1", used = 0): SpotterRider => ({ entryId: id, used, last: null });
const cfg = { crashShare: 0.2, repeatShare: 0.1 };

describe("the virtual spotter's attempts", () => {
  it("the same seed gives the same attempt", () => {
    expect(planAttempt(5, vocab, all, fresh(), cfg, 7)).toEqual(planAttempt(5, vocab, all, fresh(), cfg, 7));
  });
  it("never logs a rider who has used the division's cap", () => {
    for (let s = 0; s < 100; s++) expect(planAttempt(s, vocab, all, fresh("r1", 7), cfg, 7)).toBeNull();
    expect(planAttempt(1, vocab, all, fresh("r1", 6), cfg, 7)).not.toBeNull();
  });
  it("no cap means no limit", () => expect(planAttempt(1, vocab, all, fresh("r1", 500), cfg, null)).not.toBeNull());
  it("only blocks the division's trick base has ticked", () => {
    const off = vocab.blocks.filter((b) => b.family === "addon" || b.family === "grab_landing").map((b) => b.id);
    const enabled = all.filter((id) => !off.includes(id));
    for (let s = 0; s < 300; s++) {
      const a = planAttempt(s, vocab, enabled, fresh(), cfg, 7)!;
      for (const item of a.parts.items) expect(enabled).toContain(item.id);
    }
  });
  it("a trick base with nothing ticked still gives a trick name, not a crash of the simulator", () => {
    const a = planAttempt(3, vocab, [], fresh(), cfg, 7)!;
    expect(a.trickName.length).toBeGreaterThan(0);
  });
  it("directions alternate for one rider", () => {
    let last: SpotterRider["last"] = null;
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a: AttemptPlan = planAttempt(100 + i, vocab, all, { entryId: "r1", used: i, last }, { crashShare: 0, repeatShare: 0 }, 20)!;
      seen.push(a.direction);
      last = { trickName: a.trickName, direction: a.direction, categoryKey: a.categoryKey, parts: a.parts };
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
  it("the crash share is honoured", () => {
    const share = (c: number) => {
      let crashed = 0;
      for (let s = 0; s < 2000; s++) if (planAttempt(s, vocab, all, fresh(), { crashShare: c, repeatShare: 0 }, 7)!.status === "crashed") crashed++;
      return crashed / 2000;
    };
    expect(share(0)).toBe(0);
    expect(share(0.2)).toBeGreaterThan(0.16);
    expect(share(0.2)).toBeLessThan(0.24);
    expect(share(0.5)).toBeGreaterThan(0.45);
    expect(share(0.5)).toBeLessThan(0.55);
  });
  it("sometimes repeats the rider's last trick exactly, never when switched off", () => {
    const last = { trickName: "Left Kiteloop", direction: "left" as const, categoryKey: "kiteloop", parts: { direction: "left", items: [] } };
    let repeats = 0;
    for (let s = 0; s < 1000; s++) {
      const a = planAttempt(s, vocab, all, { entryId: "r1", used: 1, last }, { crashShare: 0, repeatShare: 0.3 }, 7)!;
      if (a.repeat) {
        repeats++;
        expect(a.trickName).toBe("Left Kiteloop");
        expect(a.direction).toBe("left");
      }
    }
    expect(repeats).toBeGreaterThan(250);
    expect(repeats).toBeLessThan(350);
    for (let s = 0; s < 200; s++) expect(planAttempt(s, vocab, all, { entryId: "r1", used: 1, last }, { crashShare: 0, repeatShare: 0 }, 7)!.repeat).toBe(false);
  });
  it("a first attempt is never a repeat", () => {
    for (let s = 0; s < 200; s++) expect(planAttempt(s, vocab, all, fresh(), { crashShare: 0, repeatShare: 0.5 }, 7)!.repeat).toBe(false);
  });
});

describe("how many attempts are due as the heat goes on", () => {
  it("nothing at the very start, everything by the end", () => {
    expect(attemptsDue({ fraction: 0, perRider: 5, cap: 7, used: 0, riderIndex: 0 })).toBe(0);
    expect(attemptsDue({ fraction: 1, perRider: 5, cap: 7, used: 0, riderIndex: 0 })).toBe(5);
  });
  it("the cap wins over the rate", () => {
    expect(attemptsDue({ fraction: 1, perRider: 10, cap: 4, used: 0, riderIndex: 0 })).toBe(4);
    expect(attemptsDue({ fraction: 1, perRider: 10, cap: null, used: 0, riderIndex: 0 })).toBe(10);
  });
  it("counts what the rider already has", () => {
    expect(attemptsDue({ fraction: 1, perRider: 5, cap: 7, used: 3, riderIndex: 0 })).toBe(2);
    expect(attemptsDue({ fraction: 1, perRider: 5, cap: 7, used: 9, riderIndex: 0 })).toBe(0);
  });
  it("riders do not all go at the same moment", () => {
    const at = (idx: number) => attemptsDue({ fraction: 0.3, perRider: 5, cap: 7, used: 0, riderIndex: idx });
    expect(at(0)).toBeGreaterThanOrEqual(at(3));
  });
  it("rises steadily through the heat", () => {
    let prev = 0;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const d = attemptsDue({ fraction: f, perRider: 6, cap: 7, used: 0, riderIndex: 1 });
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
