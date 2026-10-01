import { describe, expect, it } from "vitest";
import { nextUnscored } from "./impression-step";

// docs/08 §1H-14 — the Impression step moves on by itself
const ids = ["red", "blue", "green"];
describe("1H-14 nextUnscored", () => {
  it("after saving Red's score the step moves to Blue, the next rider without one", () => {
    expect(nextUnscored(ids, {}, "red", "red")).toBe("blue");
  });
  it("riders already scored are skipped", () => {
    expect(nextUnscored(ids, { blue: 6 }, "red", "red")).toBe("green");
  });
  it("it wraps round to an earlier rider who still has none", () => {
    expect(nextUnscored(ids, { blue: 6 }, "green", "green")).toBe("red");
  });
  it("with every rider scored there is nothing next: the answer is null and Submit takes over", () => {
    expect(nextUnscored(ids, { red: 5, blue: 6 }, "green", "green")).toBeNull();
  });
  it("the score just saved counts even if the parent has not stored it yet", () => {
    expect(nextUnscored(["red"], {}, "red", "red")).toBeNull();
  });
  it("correcting an earlier rider's score does not jump away from the corrected rider unless someone is still unscored after them", () => {
    expect(nextUnscored(ids, { red: 5, blue: 6, green: 7 }, "blue", "blue")).toBeNull();
  });
});
