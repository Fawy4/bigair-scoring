import { describe, expect, it } from "vitest";
import { hasExplicitNext, landingPath } from "./landing";

describe("where a person lands after signing in", () => {
  it("platform admins land on /admin when nothing else was asked for", () => {
    expect(landingPath({ next: null, isPlatformAdmin: true })).toBe("/admin");
    expect(landingPath({ next: undefined, isPlatformAdmin: true })).toBe("/admin");
    expect(landingPath({ next: "", isPlatformAdmin: true })).toBe("/admin");
  });
  it("organisers land on /org", () => {
    expect(landingPath({ next: null, isPlatformAdmin: false })).toBe("/org");
  });
  it("a page they were heading for wins, for admins too", () => {
    expect(landingPath({ next: "/org/events/1?tab=riders", isPlatformAdmin: true })).toBe("/org/events/1?tab=riders");
    expect(landingPath({ next: "/admin/presets", isPlatformAdmin: true })).toBe("/admin/presets");
    expect(landingPath({ next: "/org/settings", isPlatformAdmin: false })).toBe("/org/settings");
  });
  it("never sends anybody to another site", () => {
    expect(landingPath({ next: "https://evil.example.com", isPlatformAdmin: true })).toBe("/admin");
    expect(landingPath({ next: "//evil.example.com", isPlatformAdmin: false })).toBe("/org");
  });
  it("knows whether a usable next page was given", () => {
    expect(hasExplicitNext("/org/settings")).toBe(true);
    expect(hasExplicitNext(null)).toBe(false);
    expect(hasExplicitNext("//evil.example.com")).toBe(false);
  });
});
