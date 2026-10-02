import { describe, expect, it } from "vitest";
import { hash32, rng, uuidFrom } from "./random";

describe("seeded numbers", () => {
  it("the same words give the same number, different words another", () => {
    expect(hash32("a|b")).toBe(hash32("a|b"));
    expect(hash32("a|b")).not.toBe(hash32("a|c"));
  });
  it("the same seed gives the same sequence, between 0 and 1", () => {
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 50; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("a retry key looks like an id and is stable", () => {
    expect(uuidFrom("attempt|seat")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidFrom("x")).toBe(uuidFrom("x"));
    expect(uuidFrom("x")).not.toBe(uuidFrom("y"));
  });
});
