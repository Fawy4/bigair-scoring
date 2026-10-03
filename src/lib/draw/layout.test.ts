import { describe, expect, it } from "vitest";
import { heatColumns } from "./layout";

describe("the heats of a round in tight columns", () => {
  it("two heats to a column, between one and four columns", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 15].map(heatColumns)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
  });
  it("a round of 8 heats is two rows of four", () => {
    expect(heatColumns(8)).toBe(4);
    expect(Math.ceil(8 / heatColumns(8))).toBe(2);
  });
});
