import { describe, expect, it } from "vitest";
import { auditLine, type AuditRow } from "./audit-lines";

// "I edit a score with a reason and see it in the audit log" (the owner's acceptance check)
const ctx = {
  judgeWord: (seat: string) => ({ s1: "Judge 1", s2: "Judge 2" })[seat as "s1"] ?? "A judge",
  riderWord: (entry: string) => ({ red: "Red", blue: "Blue" })[entry as "red"] ?? "Rider",
  attemptWord: (attempt: string) => ({ a3: "Red 3", a4: "Blue 1" })[attempt as "a3"] ?? "an attempt",
};
const row = (action: string, extra: Partial<AuditRow> = {}): AuditRow => ({ id: "x", action, reason: null, at: "2026-10-02T10:00:00Z", before: null, after: null, ...extra });

describe("audit lines in words", () => {
  it("a score edit shows the old and the new value and the reason", () => {
    expect(auditLine(row("score_edited", { before: { attempt_id: "a3", judge_seat_id: "s1", score: 7.5 }, after: { attempt_id: "a3", judge_seat_id: "s1", score: 8 }, reason: "paper sheet" }), ctx)).toBe("Judge 1 · Red 3: 7.50 → 8.00 — paper sheet");
  });
  it("a score written where there was none, and a judge marked absent", () => {
    expect(auditLine(row("score_edited", { before: null, after: { attempt_id: "a3", judge_seat_id: "s2", score: 6.5 }, reason: "paper sheet" }), ctx)).toBe("Judge 2 · Red 3: no score → 6.50 — paper sheet");
    expect(auditLine(row("score_edited", { before: { attempt_id: "a3", judge_seat_id: "s2", score: 6.5 }, after: { attempt_id: "a3", judge_seat_id: "s2", score: null, missed: true, edit_reason: "Absent" }, reason: "Absent" }), ctx)).toBe("Judge 2 · Red 3: 6.50 → absent — Absent");
  });
  it("delete, merge, edit, status, tie, publish, re-open", () => {
    expect(auditLine(row("attempt_deleted", { after: { id: "a3" }, reason: "duplicate" }), ctx)).toBe("Deleted attempt Red 3 — duplicate");
    expect(auditLine(row("attempt_merged", { after: { id: "a4" }, reason: "same trick" }), ctx)).toBe("Merged attempt Blue 1 into the first logged — same trick");
    expect(auditLine(row("rider_status_set", { before: { modifier: null }, after: { modifier: "DNS", entry_id: "blue" }, reason: "not here" }), ctx)).toBe("Blue: Did not start — not here");
    expect(auditLine(row("heat_published", { reason: null }), ctx)).toBe("Published");
    expect(auditLine(row("heat_published", { reason: "Judge 3 left" }), ctx)).toBe("Published — Judge 3 left");
    expect(auditLine(row("heat_reopened", { reason: "score was wrong" }), ctx)).toBe("Re-opened — score was wrong");
    expect(auditLine(row("tie_decided", { after: { riderIds: ["blue", "red"] }, reason: "judges agree" }), ctx)).toBe("Tie decided: Blue ahead of Red — judges agree");
  });
  it("an action nobody has a sentence for still reads as words", () => {
    expect(auditLine(row("some_new_thing", { reason: "why" }), ctx)).toBe("Some new thing — why");
  });
});
