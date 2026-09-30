import { describe, expect, it } from "vitest";
import { pngColumns, pngLayout } from "./export-png";

describe("the picture for WhatsApp and the noticeboard", () => {
  it("has the spreadsheet's six columns: Division, Session, Start, Duration, End, Break", () => {
    expect(pngColumns(false).map((c) => c.title)).toEqual(["Division", "Session", "Start", "Duration", "End", "Break"]);
  });
  it("adds a Warm-up column before Start only when a heat has a warm-up", () => {
    expect(pngColumns(true).map((c) => c.title)).toEqual(["Division", "Session", "Warm-up", "Start", "Duration", "End", "Break"]);
  });
  it("is as tall as its rows and columns do not overlap", () => {
    const a = pngLayout(10, false);
    const b = pngLayout(20, false);
    expect(b.height - a.height).toBe(10 * a.rowHeight);
    a.columns.slice(1).forEach((c, i) => expect(c.x).toBe(a.columns[i].x + a.columns[i].width));
  });
});
