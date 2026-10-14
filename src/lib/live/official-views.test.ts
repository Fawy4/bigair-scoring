import { describe, expect, it } from "vitest";
import { SHOW_HIDDEN_OFFICIAL_VIEWS, TEST_VIEWS_MARKER, judgeViewFor, spotterViewFor, testPathOpen } from "./official-views";

const mem = (k: string, v: string | null) => ({ getItem: (key: string) => (key === k ? v : null) });
const store = (o: Record<string, string>) => ({ getItem: (key: string) => o[key] ?? null });

describe("one view for every official: the Rider sheet", () => {
  it("the product switch is off", () => {
    expect(SHOW_HIDDEN_OFFICIAL_VIEWS).toBe(false);
  });

  it("with the switch off, no stored choice and no address brings back the Queue or the Trick list", () => {
    for (const stored of ["queue", "list", "sheet", null, "anything"]) {
      expect(judgeViewFor({ stored, testPath: false, show: false })).toEqual({ view: "sheet", switchShown: false });
      expect(spotterViewFor({ stored, testPath: false, show: false })).toEqual({ view: "sheet", switchShown: false });
    }
  });

  it("the test path needs the server flag AND the marker on the phone; nothing on a live address has either", () => {
    const stored = { [TEST_VIEWS_MARKER]: "1" };
    expect(testPathOpen(true, store(stored))).toBe(true);
    expect(testPathOpen(false, store(stored))).toBe(false); // the server flag is not set (the live site)
    expect(testPathOpen(true, store({}))).toBe(false); // a phone without the marker (every new-look test)
    expect(testPathOpen(true, mem(TEST_VIEWS_MARKER, "0"))).toBe(false);
    expect(testPathOpen(true, null)).toBe(false);
    expect(testPathOpen(true, { getItem: () => { throw new Error("blocked"); } })).toBe(false);
  });

  it("on the test path a stored choice is honoured and the switch is drawn (so the old browser tests keep working)", () => {
    expect(judgeViewFor({ stored: "queue", testPath: true, show: false })).toEqual({ view: "queue", switchShown: true });
    expect(judgeViewFor({ stored: "sheet", testPath: true, show: false })).toEqual({ view: "sheet", switchShown: true });
    expect(spotterViewFor({ stored: "list", testPath: true, show: false })).toEqual({ view: "list", switchShown: true });
    expect(spotterViewFor({ stored: null, testPath: true, show: false })).toEqual({ view: "sheet", switchShown: true });
  });

  it("when the switch is turned back on, the stored choice and the switch return for everybody", () => {
    expect(judgeViewFor({ stored: "queue", testPath: false, show: true })).toEqual({ view: "queue", switchShown: true });
    expect(spotterViewFor({ stored: "list", testPath: false, show: true })).toEqual({ view: "list", switchShown: true });
    expect(judgeViewFor({ stored: null, testPath: false, show: true })).toEqual({ view: "sheet", switchShown: true });
  });
});
