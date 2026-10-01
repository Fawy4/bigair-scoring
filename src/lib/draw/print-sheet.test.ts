// Phase 4b follow-up — the draw on one A4 landscape page for WhatsApp: rounds as named columns, heats as boxes with number and start
// time, Rider labels with the lycra colour as a real colour AND its name, scaled to fit one page (two pages only when a round has
// more than 8 heats).
import { describe, expect, it } from "vitest";
import { expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { loadFormat, makeEntrants } from "@/lib/engine/ladder/fixtures";
import { builtInSchemes } from "@/lib/schemas/identification";
import { BODY_MM, MAX_HEATS_PER_COLUMN, buildPrintSheet } from "./print-sheet";

const lycra = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
const names = builtInSchemes().find((s) => s.id === "name-callout")!;
const bibs = builtInSchemes().find((s) => s.id === "bib-numbers")!;

const knockout = (n: number, decorate?: Parameters<typeof makeEntrants>[1], heatSize = 3): DivisionDraw =>
  expandFormat(loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, { heatSize, advancePerHeat: 1, finalSize: 2 })), makeEntrants(n, decorate));

const fits = (page: { mmPerEm: number; widthEm: number; heightEm: number }) => {
  expect(page.widthEm * page.mmPerEm).toBeLessThanOrEqual(BODY_MM.w + 0.01);
  expect(page.heightEm * page.mmPerEm).toBeLessThanOrEqual(BODY_MM.h + 0.01);
};

describe("one page", () => {
  it("24 riders: rounds are named columns, the whole ladder is on one page and fits it", () => {
    const draw = knockout(24);
    const sheet = buildPrintSheet(draw, lycra);
    expect(sheet.pages).toHaveLength(1);
    const cols = sheet.pages[0].columns;
    expect(cols.map((c) => c.name)).toEqual(draw.rounds.map((r) => r.name));
    expect(cols.map((c) => c.heats.length)).toEqual(draw.rounds.map((r) => r.heats.length));
    expect(cols[0].heats).toHaveLength(8);
    expect(cols.at(-1)!.name).toBe("Final");
    fits(sheet.pages[0]);
  });

  it("stays readable: text is never smaller than about 6.5 pt for the 8-heat limit", () => {
    const page = buildPrintSheet(knockout(24), lycra).pages[0];
    // 1 em = mmPerEm millimetres; 1 pt = 0.3528 mm
    expect(page.mmPerEm / 0.3528).toBeGreaterThanOrEqual(6.5);
  });

  it("a small ladder is not blown up beyond a comfortable size", () => {
    const page = buildPrintSheet(knockout(6), lycra).pages[0];
    expect(page.mmPerEm).toBeLessThanOrEqual(3.6);
  });

  it("every heat box shows its heat number", () => {
    const draw = knockout(24);
    const heats = buildPrintSheet(draw, lycra).pages[0].columns.flatMap((c) => c.heats);
    const total = draw.rounds.reduce((n, r) => n + r.heats.length, 0);
    expect(heats.map((h) => h.title)).toEqual(Array.from({ length: total }, (_, i) => `Heat ${i + 1}`));
  });

  it("heat boxes of a column do not overlap and stay inside the column", () => {
    for (const col of buildPrintSheet(knockout(24), lycra).pages[0].columns) {
      let bottom = 0;
      for (const h of col.heats) {
        expect(h.y).toBeGreaterThanOrEqual(bottom);
        bottom = h.y + h.h;
      }
      expect(bottom).toBeLessThanOrEqual(col.h + 0.001);
    }
  });
});

describe("start times", () => {
  it("a heat shows its start time when a run order has one, nothing when it has not", () => {
    const draw = knockout(24);
    const uid = draw.rounds[0].heats[0].uid!;
    const sheet = buildPrintSheet(draw, lycra, { times: { [uid]: "10:05" } });
    const heats = sheet.pages[0].columns.flatMap((c) => c.heats);
    expect(heats[0].time).toBe("10:05");
    expect(heats.slice(1).every((h) => h.time === null)).toBe(true);
    expect(buildPrintSheet(draw, lycra).pages[0].columns.flatMap((c) => c.heats).every((h) => h.time === null)).toBe(true);
    expect(sheet.hasTimes).toBe(true);
    expect(buildPrintSheet(draw, lycra).hasTimes).toBe(false);
  });
});

describe("Rider labels on paper", () => {
  it("a lycra colour is printed as the real colour AND its name", () => {
    const seats = buildPrintSheet(knockout(24), lycra).pages[0].columns[0].heats.flatMap((h) => h.seats);
    const first = seats[0];
    expect(first.tag?.text).toBe("RED");
    expect(first.tag?.hex).toBe(lycra.palette.find((c) => c.key === "red")!.hex);
    expect(first.text).toBe("Rider 1");
    for (const s of seats) {
      expect(s.tag, "every Round 1 seat has a lycra colour").not.toBeNull();
      expect(s.tag!.text.length).toBeGreaterThan(0);
      expect(s.tag!.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("white and black are outlined so they survive a black-and-white printer", () => {
    const tags = buildPrintSheet(knockout(25, undefined, 5), lycra).pages[0].columns[0].heats.flatMap((h) => h.seats.map((s) => s.tag!));
    expect(tags.find((t) => t.text === "WHITE")?.outlined).toBe(true);
    expect(tags.find((t) => t.text === "BLACK")?.outlined ?? true).toBe(true);
  });

  it("later rounds show the place a seat waits for", () => {
    const second = buildPrintSheet(knockout(24), lycra).pages[0].columns[1].heats[0].seats;
    expect(second.map((s) => s.text)).toEqual(["1st H1", "1st H2"]);
    expect(second.every((s) => s.tag === null)).toBe(true);
  });

  it("a name call-out scheme prints names with no tag; a bib scheme prints the number", () => {
    const plain = buildPrintSheet(knockout(12), names).pages[0].columns[0].heats[0].seats;
    expect(plain.every((s) => s.tag === null)).toBe(true);
    const withBibs = buildPrintSheet(knockout(12, (n) => ({ identifiers: { bib: 100 + n } })), bibs).pages[0].columns[0].heats[0].seats;
    expect(withBibs[0].tag?.text).toBe("100".length ? "101" : "");
  });

  it("empty seats are said out loud", () => {
    const draw = knockout(24);
    delete draw.rounds[0].heats[0].slots[0].entrantId;
    const seat = buildPrintSheet(draw, lycra).pages[0].columns[0].heats[0].seats[0];
    expect(seat.kind).toBe("empty");
    expect(seat.text).toBe("Empty seat");
  });
});

describe("two pages", () => {
  it(`only when a round has more than ${MAX_HEATS_PER_COLUMN} heats: big rounds first, then the rest, each scaled to its page`, () => {
    const draw = knockout(30); // 10 heats of 3 in Round 1
    expect(draw.rounds[0].heats.length).toBeGreaterThan(MAX_HEATS_PER_COLUMN);
    const sheet = buildPrintSheet(draw, lycra);
    expect(sheet.pages).toHaveLength(2);
    expect(sheet.pages[0].columns.map((c) => c.round)).toEqual(["R1", "R1"]);
    // spread evenly over columns of at most 8 heats (10 → 5 + 5)
    expect(sheet.pages[0].columns.map((c) => c.heats.length)).toEqual([5, 5]);
    expect(sheet.pages[0].columns.map((c) => c.part)).toEqual([{ index: 1, of: 2 }, { index: 2, of: 2 }]);
    expect(sheet.pages[1].columns.map((c) => c.name)).toContain("Final");
    for (const p of sheet.pages) fits(p);
    expect(sheet.pages.map((p) => p.index)).toEqual([1, 2]);
    expect(sheet.pages.every((p) => p.of === 2)).toBe(true);
  });

  it("exactly 8 heats in the biggest round is still one page", () => {
    expect(buildPrintSheet(knockout(24), lycra).pages).toHaveLength(1);
  });

  it("a division whose only round is big gets one page of columns, never an empty second page", () => {
    const draw = knockout(30);
    draw.rounds = [draw.rounds[0]];
    expect(buildPrintSheet(draw, lycra).pages).toHaveLength(1);
  });
});
