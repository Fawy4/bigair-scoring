import { describe, expect, it } from "vitest";
import { DEFAULT_TAGLINE, resolvePlatformSettings, settingsToRows, validatePlatformSettings } from "./settings";

const env = { productName: "[PRODUCT_NAME]", timezone: "Africa/Cairo" };

describe("platform settings: what the site shows", () => {
  it("falls back to the environment values and the default tagline when nothing is set", () => {
    const s = resolvePlatformSettings([], env);
    expect(s.productName).toBe("[PRODUCT_NAME]");
    expect(s.tagline).toBe("Live scoring and results for kite competitions");
    expect(DEFAULT_TAGLINE).toBe(s.tagline);
    expect(s.logoUrl).toBeNull();
    expect(s.defaultTimezone).toBe("Africa/Cairo");
    expect(s.legalTexts).toEqual({ terms: "", privacy: "" });
  });

  it("a product name set by the owner overrides the environment name everywhere", () => {
    const s = resolvePlatformSettings([{ key: "product_name", value: "Sendbook" }], env);
    expect(s.productName).toBe("Sendbook");
  });

  it("a blank product name means 'not set', so the environment name is used again", () => {
    expect(resolvePlatformSettings([{ key: "product_name", value: "   " }], env).productName).toBe("[PRODUCT_NAME]");
    expect(resolvePlatformSettings([{ key: "product_name", value: null }], env).productName).toBe("[PRODUCT_NAME]");
  });

  it("reads tagline, logo, time zone and legal texts", () => {
    const s = resolvePlatformSettings(
      [
        { key: "tagline", value: "Results, live." },
        { key: "logo_url", value: "https://example.com/logo.png" },
        { key: "default_timezone", value: "Europe/Berlin" },
        { key: "legal_texts", value: { terms: "T", privacy: "P" } },
      ],
      env,
    );
    expect(s).toMatchObject({ tagline: "Results, live.", logoUrl: "https://example.com/logo.png", defaultTimezone: "Europe/Berlin", legalTexts: { terms: "T", privacy: "P" } });
  });

  it("ignores broken stored values instead of crashing the site", () => {
    const s = resolvePlatformSettings(
      [
        { key: "default_timezone", value: "Mars/Olympus" },
        { key: "logo_url", value: 42 },
        { key: "legal_texts", value: "not an object" },
        { key: "unknown_key", value: "x" },
      ],
      env,
    );
    expect(s.defaultTimezone).toBe("Africa/Cairo");
    expect(s.logoUrl).toBeNull();
    expect(s.legalTexts).toEqual({ terms: "", privacy: "" });
  });
});

describe("platform settings: saving", () => {
  const good = { productName: "Sendbook", logoUrl: "", tagline: "Hello", defaultTimezone: "Africa/Cairo", terms: "", privacy: "" };

  it("accepts good values and turns them into the stored key/value rows", () => {
    const r = validatePlatformSettings(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const rows = settingsToRows(r.value);
      expect(rows.find((x) => x.key === "product_name")?.value).toBe("Sendbook");
      expect(rows.find((x) => x.key === "logo_url")?.value).toBeNull();
      expect(rows.find((x) => x.key === "legal_texts")?.value).toEqual({ terms: "", privacy: "" });
      expect(rows.map((x) => x.key).sort()).toEqual(["default_timezone", "legal_texts", "logo_url", "product_name", "tagline"]);
    }
  });

  it("a blank tagline goes back to the default sentence", () => {
    const r = validatePlatformSettings({ ...good, tagline: "  " });
    expect(r.ok && r.value.tagline).toBe(DEFAULT_TAGLINE);
  });

  it("refuses an unknown time zone, a long product name and a logo address that is not http(s)", () => {
    const r = validatePlatformSettings({ ...good, defaultTimezone: "Mars/Olympus", productName: "x".repeat(61), logoUrl: "javascript:alert(1)" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["defaultTimezone", "logoUrl", "productName"]);
  });
});
