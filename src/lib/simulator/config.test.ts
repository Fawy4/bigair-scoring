import { describe, expect, it } from "vitest";
import { defaultSimConfig, isSpeed, parseSimConfig, SPEEDS, withSettings, parseSettingsPatch } from "./config";

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

// Polish 2, item 4: "one judge misses attempts" silently changed attempts per rider from 7 to 5. Every behaviour setting is independent: saving one never changes another.
describe("behaviour settings are independent", () => {
  const seven = withSettings(defaultSimConfig(), { attemptsPerRider: 7, crashShare: 0.3, spread: "disagree" });
  it("choosing 'one judge misses attempts' keeps 7 attempts per rider (and every other setting)", () => {
    const patch = parseSettingsPatch({ judgeMode: "misses" });
    expect(patch).toEqual({ judgeMode: "misses" });
    const next = withSettings(seven, patch!);
    expect(next).toEqual({ ...seven, judgeMode: "misses" });
    expect(next.attemptsPerRider).toBe(7);
  });
  it("changing attempts per rider keeps the judge mode", () => {
    const misses = withSettings(seven, { judgeMode: "misses", specialJudge: 3 });
    const next = withSettings(misses, parseSettingsPatch({ attemptsPerRider: 4 })!);
    expect(next).toEqual({ ...misses, attemptsPerRider: 4 });
  });
  it("every single setting, saved alone, changes only itself", () => {
    const samples: Record<string, unknown> = { attemptsPerRider: 3, crashShare: 0.5, repeatShare: 0.2, spread: "agree", judgeMode: "late", specialJudge: 1, missShare: 0.5, offlineSec: 30, lateSec: 40 };
    for (const [k, v] of Object.entries(samples)) {
      const next = withSettings(seven, parseSettingsPatch({ [k]: v })!);
      expect(next, k).toEqual({ ...seven, [k]: v });
    }
  });
  it("a bad value or a key that is not a setting is refused (nothing saved)", () => {
    expect(parseSettingsPatch({ attemptsPerRider: 0 })).toBeNull();
    expect(parseSettingsPatch({ judgeMode: "asleep" })).toBeNull();
    expect(parseSettingsPatch({ armed: ["x"] } as never)).toBeNull();
  });
});

describe("Skip to end of heat's review hold (Polish 3, item 1)", () => {
  it("is empty by default and survives a save of another setting", () => {
    const c = defaultSimConfig();
    expect(c.reviewHold).toBeNull();
    expect(withSettings({ ...c, reviewHold: "h1" }, { attemptsPerRider: 6 }).reviewHold).toBe("h1");
  });
});
