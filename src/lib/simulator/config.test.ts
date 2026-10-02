import { describe, expect, it } from "vitest";
import { defaultSimConfig, isSpeed, parseSimConfig, SPEEDS, withSettings } from "./config";

describe("simulator settings", () => {
  it("an empty object is a working setup", () => {
    const c = parseSimConfig({});
    expect(c.attemptsPerRider).toBe(5);
    expect(c.crashShare).toBeCloseTo(0.2);
    expect(c.spread).toBe("normal");
    expect(c.judgeMode).toBe("none");
    expect(c.armed).toEqual([]);
    expect(c.tie).toBeNull();
  });
  it("unreadable settings fall back to the defaults instead of failing", () => {
    expect(parseSimConfig({ crashShare: 7 })).toEqual(defaultSimConfig());
    expect(parseSimConfig("nonsense")).toEqual(defaultSimConfig());
    expect(parseSimConfig(null)).toEqual(defaultSimConfig());
  });
  it("the four speeds, and nothing else", () => {
    expect([...SPEEDS]).toEqual([1, 5, 10, 20]);
    expect([1, 5, 10, 20].every(isSpeed)).toBe(true);
    expect(isSpeed(2)).toBe(false);
  });
  it("changing a setting keeps the scenarios' memory", () => {
    const c = { ...defaultSimConfig(), armed: ["tie"], windHeld: true };
    const next = withSettings(c, { spread: "disagree", attemptsPerRider: 3 });
    expect(next.spread).toBe("disagree");
    expect(next.attemptsPerRider).toBe(3);
    expect(next.armed).toEqual(["tie"]);
    expect(next.windHeld).toBe(true);
  });
  it("refuses a value outside its range", () => {
    expect(() => withSettings(defaultSimConfig(), { crashShare: 1.5 })).toThrow();
  });
});
