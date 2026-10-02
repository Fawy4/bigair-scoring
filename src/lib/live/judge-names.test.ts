import { describe, expect, it } from "vitest";
import { judgeNames, judgeWordFor, judgeWordOf } from "./judge-names";
import { publishChecklist } from "./publish-checklist";
import { auditLine, type AuditRow } from "./audit-lines";

// Console v2 §2: the judges are read by their seat names ("Fawy", with "J1" as a small sub-label), never "Judge 1".
const panel = ["s-fawy", "s-ali", "s-noor"];
const names = { "s-fawy": "Fawy", "s-ali": "Ali", "s-noor": "Noor" };

describe("judge names", () => {
  it("each panel judge has the seat's name and the tag of the place on the panel", () => {
    expect(judgeNames(panel, names)).toEqual([
      { id: "s-fawy", name: "Fawy", tag: "J1" },
      { id: "s-ali", name: "Ali", tag: "J2" },
      { id: "s-noor", name: "Noor", tag: "J3" },
    ]);
  });
  it("a seat without a known name reads as its tag, and a blank name counts as no name", () => {
    expect(judgeNames(panel, { "s-fawy": "  " })[0]).toEqual({ id: "s-fawy", name: null, tag: "J1" });
    expect(judgeWordOf({ name: null, tag: "J2" })).toBe("J2");
  });
  it("two judges called the same stay apart by their tags", () => {
    const two = judgeNames(["a", "b"], { a: "Ali", b: "Ali" });
    expect(two.map((j) => `${j.name} ${j.tag}`)).toEqual(["Ali J1", "Ali J2"]);
  });
  it("the word for a sentence: the name, else the tag, and a seat that is not on the panel is 'A judge'", () => {
    const word = judgeWordFor(panel, { "s-fawy": "Fawy" });
    expect(word("s-fawy")).toBe("Fawy");
    expect(word("s-ali")).toBe("J2");
    expect(word("someone-else")).toBe("A judge");
  });
});

describe("the names reach every sentence of the console", () => {
  const word = judgeWordFor(panel, names);
  it("blockers: 'Fawy: sheet not submitted …', 'Ali: score for Red, attempt 3 missing', never 'Judge 1'", () => {
    const c = publishChecklist({
      blockers: [
        { type: "score_missing", judge: "s-ali", rider: "red", attemptSeq: 3 },
        { type: "impression_missing", judge: "s-noor", rider: "red" },
      ],
      unsubmitted: ["s-fawy"],
      judgeWord: word,
      riderLabel: () => "Red",
      impressionLabel: "Impression / Variety score",
    });
    expect(c.items.map((i) => i.text)).toEqual(["Fawy: sheet not submitted — every score is in", "Ali: score for Red, attempt 3 missing", "Noor: Impression / Variety score for Red missing"]);
    expect(c.items.map((i) => i.text).join(" ")).not.toMatch(/Judge \d/);
  });
  it("the audit log: 'Fawy · Red 3: 7.50 → 8.00'", () => {
    const row: AuditRow = { id: "x", action: "score_edited", reason: "paper sheet", at: "2026-10-02T10:00:00Z", before: { attempt_id: "a3", judge_seat_id: "s-fawy", score: 7.5 }, after: { attempt_id: "a3", judge_seat_id: "s-fawy", score: 8 } };
    expect(auditLine(row, { judgeWord: word, riderWord: () => "Red", attemptWord: () => "Red 3" })).toBe("Fawy · Red 3: 7.50 → 8.00 — paper sheet");
  });
});
