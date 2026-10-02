import { describe, expect, it } from "vitest";
import { nextOpenRider, type SheetRider } from "./impression-sheet";

// Polish 2, item 6: after a rider's score is entered, the next rider who has nothing yet is selected.
const r = (id: string, state: SheetRider["now"]["state"] = "missing"): SheetRider => ({ id, word: id, now: { state, value: state === "done" ? 7 : null } });
describe("the next rider on the sheet", () => {
  const riders = [r("red"), r("blue", "done"), r("green"), r("yellow", "absent")];
  it("Red typed → Green (Blue already has one)", () => {
    expect(nextOpenRider(riders, { red: { value: 7, missed: false } }, "red")).toBe("green");
  });
  it("Green typed after Red → nobody left", () => {
    expect(nextOpenRider(riders, { red: { value: 7, missed: false }, green: { value: null, missed: true } }, "green")).toBeNull();
  });
  it("wraps round: Green typed first → Red", () => {
    expect(nextOpenRider(riders, { green: { value: 6, missed: false } }, "green")).toBe("red");
  });
});
