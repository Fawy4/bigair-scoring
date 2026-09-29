import { describe, expect, it } from "vitest";
import { addMinutes, localToUtc, toIso, tzOffsetMs, utcToLocalHHMM } from "./time";

describe("time zones (Africa/Cairo has DST: UTC+3 in summer, UTC+2 in winter)", () => {
  it("Cairo summer is UTC+3", () => {
    expect(tzOffsetMs(Date.UTC(2026, 6, 1, 12), "Africa/Cairo")).toBe(3 * 3_600_000);
    expect(toIso(localToUtc("2026-10-03", "10:30", "Africa/Cairo"))).toBe("2026-10-03T07:30:00.000Z");
  });

  it("Cairo winter is UTC+2", () => {
    expect(tzOffsetMs(Date.UTC(2026, 0, 15, 12), "Africa/Cairo")).toBe(2 * 3_600_000);
    expect(toIso(localToUtc("2026-12-15", "10:30", "Africa/Cairo"))).toBe("2026-12-15T08:30:00.000Z");
  });

  it("the offset changes at the end of Egyptian summer time (Thursday 29 Oct 2026)", () => {
    expect(toIso(localToUtc("2026-10-28", "12:00", "Africa/Cairo"))).toBe("2026-10-28T09:00:00.000Z");
    expect(toIso(localToUtc("2026-10-30", "12:00", "Africa/Cairo"))).toBe("2026-10-30T10:00:00.000Z");
  });

  it("round-trips local → UTC → local", () => {
    for (const day of ["2026-01-10", "2026-04-20", "2026-10-03", "2026-10-30"]) {
      for (const t of ["00:00", "09:05", "16:53", "23:59"]) {
        expect(utcToLocalHHMM(localToUtc(day, t, "Africa/Cairo"), "Africa/Cairo")).toBe(t);
      }
    }
  });

  it("a wall-clock time inside Egypt's spring gap (Friday 24 Apr 2026, 00:00 does not exist) lands on 01:00", () => {
    expect(utcToLocalHHMM(localToUtc("2026-04-24", "00:00", "Africa/Cairo"), "Africa/Cairo")).toBe("01:00");
  });

  it("works for other zones and for a DST gap (Europe/Berlin, 29 Mar 2026 02:30 does not exist)", () => {
    expect(toIso(localToUtc("2026-07-01", "12:00", "Europe/Berlin"))).toBe("2026-07-01T10:00:00.000Z");
    expect(toIso(localToUtc("2026-01-01", "12:00", "Europe/Berlin"))).toBe("2026-01-01T11:00:00.000Z");
    expect(utcToLocalHHMM(localToUtc("2026-03-29", "02:30", "Europe/Berlin"), "Europe/Berlin")).toBe("03:30");
  });

  it("formats ISO strings and drops seconds", () => {
    expect(utcToLocalHHMM("2026-10-03T13:10:59.000Z", "Africa/Cairo")).toBe("16:10");
    expect(addMinutes("2026-10-03T07:30:00.000Z", 9)).toBe("2026-10-03T07:39:00.000Z");
    expect(addMinutes(Date.UTC(2026, 9, 3, 7, 30), -30)).toBe("2026-10-03T07:00:00.000Z");
  });
});
