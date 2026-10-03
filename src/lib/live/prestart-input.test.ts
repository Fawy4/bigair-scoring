import { describe, expect, it } from "vitest";
import { PRESTART_MAX_SEC, PRESTART_MIN_SEC, parsePrestart } from "./prestart-input";

describe("the pre-start the head judge types (Other…)", () => {
  it("minutes and seconds", () => {
    expect(parsePrestart("1:30")).toEqual({ ok: true, sec: 90 });
    expect(parsePrestart(" 0:10 ")).toEqual({ ok: true, sec: 10 });
    expect(parsePrestart("15:00")).toEqual({ ok: true, sec: 900 });
    expect(parsePrestart("2:05")).toEqual({ ok: true, sec: 125 });
  });
  it("whole minutes", () => {
    expect(parsePrestart("2")).toEqual({ ok: true, sec: 120 });
    expect(parsePrestart("15")).toEqual({ ok: true, sec: 900 });
    expect(parsePrestart("1")).toEqual({ ok: true, sec: 60 });
  });
  it("the limits are 0:10 and 15:00", () => {
    expect(PRESTART_MIN_SEC).toBe(10);
    expect(PRESTART_MAX_SEC).toBe(900);
    expect(parsePrestart("0:09").ok).toBe(false);
    expect(parsePrestart("15:01").ok).toBe(false);
    expect(parsePrestart("16").ok).toBe(false);
    expect(parsePrestart("0").ok).toBe(false);
  });
  it("anything else is refused", () => {
    for (const bad of ["", "abc", "1:5", "1:75", "1:60", "-1", "1.5", "1:30:00", ":30", "1:", "90s", "٢"]) expect(parsePrestart(bad), bad).toEqual({ ok: false });
  });
});
