import { describe, expect, it } from "vitest";
import { practiceAttempt, type PracticeRider } from "./practice";
import { KOTA } from "./design-fixtures";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import { buildTrickVocab, type VocabularyInput } from "@/lib/engine/tricks";

// docs/08 §1H-12
const vocab = buildTrickVocab(vocabularyJson as unknown as VocabularyInput);
const all = vocab.blocks.map((b) => b.id);
const riders: PracticeRider[] = [
  { entryId: "r1", used: 0 },
  { entryId: "r2", used: 3 },
  { entryId: "r3", used: KOTA.heat.maxAttemptsPerRider ?? 7 },
];
const cap = KOTA.heat.maxAttemptsPerRider ?? 7;

describe("1H-12 practice attempts", () => {
  it("the same seed gives the same feed", () => {
    const run = () => {
      const counts = riders.map((r) => ({ ...r }));
      return Array.from({ length: 6 }, (_, i) => {
        const a = practiceAttempt(42 + i, vocab, all, counts, cap)!;
        counts.find((c) => c.entryId === a.entryId)!.used++;
        return a;
      });
    };
    expect(run()).toEqual(run());
  });
  it("never a rider who is out of attempts", () => {
    for (let s = 0; s < 200; s++) expect(practiceAttempt(s, vocab, all, riders, cap)!.entryId).not.toBe("r3");
  });
  it("nobody left to ride → nothing", () => expect(practiceAttempt(1, vocab, all, [{ entryId: "x", used: cap }], cap)).toBeNull());
  it("never a block that is unticked in the trick base", () => {
    const off = vocab.blocks.filter((b) => b.family === "addon" || b.family === "grab_landing").map((b) => b.id);
    const enabled = all.filter((id) => !off.includes(id));
    for (let s = 0; s < 200; s++) {
      const a = practiceAttempt(s, vocab, enabled, riders, cap)!;
      for (const item of a.parts.items) expect(enabled).toContain(item.id);
    }
  });
  it("about 1 in 5 attempts is a crash", () => {
    let crashes = 0;
    for (let s = 0; s < 1000; s++) if (practiceAttempt(s, vocab, all, riders, cap)!.status === "crashed") crashes++;
    expect(crashes).toBeGreaterThan(150);
    expect(crashes).toBeLessThan(250);
  });
  it("gives a trick name and a direction", () => {
    const a = practiceAttempt(7, vocab, all, riders, cap)!;
    expect(a.trickName.length).toBeGreaterThan(0);
    expect(["left", "right"]).toContain(a.direction);
  });
});
