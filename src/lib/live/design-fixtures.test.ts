import { describe, expect, it } from "vitest";
import {
  blockIdsFor,
  headPhone,
  judgeLive,
  FIXTURE_SCHEMES,
  impressionRiders,
  JUDGE_IDS,
  labelRiders,
  matrixMain,
  matrixStates,
  previewCompose,
  resultRows,
  tileRiders,
} from "./design-fixtures";

// The /design page shows real numbers: the KOTA heat of docs/08 §1A and its variants. If a value here is wrong, the page is lying to the owner.
describe("docs/08 §1A on the result row", () => {
  const red = resultRows()[0];
  it("Red wins with 31.54", () => {
    expect(red.place).toBe(1);
    expect(red.totalLabel).toBe("31.54");
  });
  it("the percent of maximum stays in the data (78.85) for exports, but is only worded when a division turns it on", () => {
    expect(red.percent).toBe(78.85);
    expect(red.percentLabel).toBe("78.85 % of maximum");
  });
  it("the sum is written in words with the scoring model's own name for the score: 31.54 = tricks 24.04 + Impression 7.50", () => {
    expect(red.formula).toBe("31.54 = tricks 24.04 + Impression 7.50");
    expect(resultRows().every((r) => !/%/.test(r.formula ?? ""))).toBe(true);
  });
  it("attempts 2, 5 and 1 count (8.25, 8.08, 7.71); attempt 4 is the crash", () => {
    expect(red.attempts.filter((a) => a.counted).map((a) => [a.seq, a.scoreLabel])).toEqual([
      [1, "7.71"],
      [2, "8.25"],
      [5, "8.08"],
    ]);
    const crash = red.attempts.find((a) => a.status === "crashed")!;
    expect(crash.seq).toBe(4);
    expect(crash.counted).toBe(false);
    expect(crash.scoreLabel).toBeNull();
  });
  it("a DNS rider has no total (shown as —) and is placed last", () => {
    const dns = resultRows().at(-1)!;
    expect(dns.status).toBe("DNS");
    expect(dns.totalLabel).toBe("—");
    expect(dns.formula).toBeNull();
    expect(dns.place).toBe(3);
  });
});

describe("docs/08 §1A on the score table", () => {
  it("panel column is 7.71 / 8.25 / 7.29 / crash / 8.08", () => {
    expect(matrixMain().rows.map((r) => r.panel)).toEqual([7.71, 8.25, 7.29, null, 8.08]);
    expect(matrixMain().rows.map((r) => r.panelLabel)).toEqual(["7.71", "8.25", "7.29", "—", "8.08"]);
  });
  it("attempt 1 shows the three judge trick scores 7.625 / 7.75 / 7.75", () => {
    expect(matrixMain().rows[0].cells.map((c) => c.label)).toEqual(["7.625", "7.75", "7.75"]);
  });
  it("attempt 4 is the crash: every cell says crash", () => {
    expect(matrixMain().rows[3].cells.every((c) => c.state === "crash")).toBe(true);
  });
  it("has the three judges as columns", () => expect(matrixMain().judgeIds).toEqual(JUDGE_IDS));
});

describe("every cell state is shown at least once, with the doc 08 values where there are some", () => {
  const rows = matrixStates().rows;
  const states = new Set(rows.flatMap((r) => [...r.cells.map((c) => c.state), `row:${r.state}`, `panel:${r.panelState}`]));
  it("1A-i: J3 has not scored attempt 3 → missing, panel 7.31, incomplete", () => {
    const r = rows.find((x) => x.id === "missing")!;
    expect(r.cells[2].state).toBe("missing");
    expect(r.panel).toBe(7.31);
    expect(r.panelState).toBe("incomplete");
  });
  it("§1F: J3 Missed attempt 3 → missed, panel 7.31, not incomplete", () => {
    const r = rows.find((x) => x.id === "missed")!;
    expect(r.cells[2].state).toBe("missed");
    expect(r.panel).toBe(7.31);
    expect(r.panelState).toBe("ok");
  });
  it("an outlier row has an outlier cell", () => {
    expect(rows.find((x) => x.id === "outlier")!.cells.some((c) => c.state === "outlier")).toBe(true);
  });
  it("covers scored, missing, missed, absent, outlier, crash, deleted and duplicate", () => {
    for (const s of ["scored", "missing", "missed", "absent", "outlier", "crash", "row:deleted", "row:duplicate"]) expect(states.has(s), s).toBe(true);
  });
});

describe("Rider label fixtures", () => {
  it("the three standard schemes: Lycra colour per heat, Bib / sail number, Name call-out", () => {
    expect(FIXTURE_SCHEMES.map((s) => s.name)).toEqual(["Lycra colour per heat", "Bib / sail number", "Name call-out"]);
  });
  it("includes White and Black Lycras for the outline check", () => {
    expect(labelRiders().map((r) => r.slotColour)).toEqual(expect.arrayContaining(["white", "black"]));
  });
  it("the tile riders include one at 5 / 7, and one out of attempts at 7 / 7 (5 landed + 2 crashed, docs/08 §1F legacy vector)", () => {
    const t = tileRiders();
    expect(t.map((x) => [x.attempts, x.max])).toEqual(expect.arrayContaining([[5, 7], [7, 7]]));
  });
});

describe("the heat-end summary (compact)", () => {
  const riders = impressionRiders();
  it("Red's summary is the §1A heat: 5 attempts, 4 landed, 1 crashed, no repeats, Left 3 · Right 1", () => {
    const red = riders[0].summary;
    expect([red.attempts, red.landed, red.crashed, red.repeats]).toEqual([5, 4, 1, 0]);
    expect([red.left, red.right]).toEqual([3, 1]);
  });
  it("has no rotation or family analysis", () => {
    expect(Object.keys(riders[0].summary).sort()).toEqual(["attempts", "crashed", "landedList", "landed", "left", "repeats", "right"].sort());
  });
  it("Red's landed list is sorted by the judge's own score and shows the direction: Double loop, Right, 8.25 first", () => {
    const list = riders[0].summary.landedList;
    expect(list[0]).toMatchObject({ trick: "Double loop", scoreLabel: "8.25", direction: "right" });
    expect(list.map((x) => x.seq)).toEqual([2, 5, 1, 3]);
  });
  it("a repeated landing counts as a repeat (Blue landed Backroll twice)", () => {
    expect(riders[1].summary.repeats).toBe(1);
  });
  it("three riders; the first already has the 7.5 of docs/08 §1A, the others none yet", () => {
    expect(riders).toHaveLength(3);
    expect(riders[0].initialValue).toBe(7.5);
    expect(riders[1].initialValue).toBeNull();
  });
});

describe("the judge's live screen", () => {
  const j = judgeLive();
  it("shows 3 to 4 riders, Red selected at 6 / 7, one rider out of attempts", () => {
    expect(j.riders.length).toBeGreaterThanOrEqual(3);
    expect(j.riders.length).toBeLessThanOrEqual(4);
    expect(j.riders[0]).toMatchObject({ attempts: 6, max: 7, selected: true });
    expect(j.riders.some((r) => r.attempts >= r.max)).toBe(true);
  });
  it("the current attempt is Red's 6th; the previous one is the 5th (Contra loop, you gave 8.125)", () => {
    expect(j.current.number).toBe(6);
    expect(j.previous).toMatchObject({ number: 5, trick: "Contra loop", myScoreLabel: "8.125" });
  });
  it("Red's sheet: attempts 1–5 from docs/08, counted tricks 2, 5, 1, the crash, Left 3 · Right 1, attempts 6 / 7", () => {
    const s = j.sheet;
    expect(s.attempts.filter((a) => a.counted).map((a) => a.seq)).toEqual([1, 2, 5]);
    expect(s.attempts.find((a) => a.status === "crashed")?.seq).toBe(4);
    expect([s.left, s.right]).toEqual([3, 1]);
    expect(s.counter).toBe("6 / 7");
    expect(s.attempts.find((a) => a.seq === 2)?.myScoreLabel).toBe("8.25");
  });
  it("the detailed list has every attempt with its trick name and status", () => {
    expect(j.details.map((d) => d.number)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(j.details.find((d) => d.number === 4)?.status).toBe("crashed");
  });
});

describe("the head judge's phone", () => {
  it("shows the controls of a running heat and nothing about scores", () => {
    const h = headPhone();
    expect(h.state).toBe("running");
    expect(h.remainingMs).toBe(330_000);
    expect(h.controls.map((c) => c.id)).toEqual(["pause", "end", "hold", "resumeAt", "shift5", "shift10", "publish", "reopen"]);
    expect(h.controls.find((c) => c.id === "publish")?.enabled).toBe(false);
  });
});

describe("the spotter builder (preview only; the real composer is built in 5b)", () => {
  it("Left ×2 Backroll Board-off Handle pass, whatever order the add-ons were tapped (docs/08 §1F)", () => {
    const a = previewCompose({ direction: "left", multiplier: "x2", base: "backroll", addons: ["board_off", "handle_pass"] });
    const b = previewCompose({ direction: "left", multiplier: "x2", base: "backroll", addons: ["handle_pass", "board_off"] });
    expect(a.name).toBe("Left ×2 Backroll Board-off Handle pass");
    expect(b.name).toBe(a.name);
    expect(a.categoryKey).toBe("handle_pass");
  });
  it("×1 is not written", () => {
    expect(previewCompose({ direction: "right", multiplier: "x1", base: "frontroll", addons: [] })).toEqual({ name: "Right Frontroll", categoryKey: "rotation" });
  });
  it("nothing chosen gives no name", () => expect(previewCompose({ addons: [] }).name).toBe(""));
  it("every block of the vocabulary has an id the builder can use", () => expect(blockIdsFor().length).toBeGreaterThan(30));
});
