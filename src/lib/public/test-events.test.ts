import { describe, expect, it } from "vitest";
import { isThrowawayTestEvent, withoutTestEvents } from "./test-events";

const ev = (organisation_name: string | null) => ({ id: organisation_name ?? "none", organisation_name });

describe("test events on the public home page", () => {
  it("recognises a throwaway organisation made by the e2e helper, and nothing else", () => {
    expect(isThrowawayTestEvent(ev("E2E Big Air 8552cb68"))).toBe(true);
    for (const real of ["Arrow", "EKL", "Demo", "Red Bull Kite Club", "E2E Big Air", "E2E Big Air Series", "e2e big air 8552cb68", "rls-1a2b3c4d", null]) expect(isThrowawayTestEvent(ev(real))).toBe(false);
  });
  it("leaves test events out for visitors and keeps every real event, in order", () => {
    const list = [ev("Arrow"), ev("E2E Big Air 0123abcd"), ev("EKL"), ev("E2E Big Air ffffffff"), ev(null)];
    expect(withoutTestEvents(list, false).map((e) => e.id)).toEqual(["Arrow", "EKL", "none"]);
  });
  it("shows them on a test server (SHOW_TEST_EVENTS=1) so the browser tests can find their own", () => {
    const list = [ev("Arrow"), ev("E2E Big Air 0123abcd")];
    expect(withoutTestEvents(list, true)).toHaveLength(2);
  });
  it("the real configuration: the page filters, the test servers switch it off", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain("withoutTestEvents(");
    expect(readFileSync("playwright.config.ts", "utf8").match(/SHOW_TEST_EVENTS=1/g)).toHaveLength(2);
  });
});
