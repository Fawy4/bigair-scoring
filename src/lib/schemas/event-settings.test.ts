import { describe, expect, it } from "vitest";
import { builtInSchemes, defaultScheme, IdentificationSchemeSchema, lycraScheme, usesLycras } from "./identification";
import { EventFormSchema, parseEventSettings, slugify } from "./event-settings";
import { isValidTimeZone, OrgSlugSchema, parseOrgSettings } from "./org-settings";

const base = {
  name: "Arrow Big Air",
  slug: "arrow-big-air",
  location: "El Gouna",
  start_date: "2026-10-02",
  end_date: "2026-10-04",
  timezone: "Africa/Cairo",
  settings: {},
  branding: {},
};

describe("identification schemes", () => {
  it("all six built-in schemes parse and carry the shared palette", () => {
    const all = builtInSchemes();
    expect(all.map((s) => s.id)).toEqual(["name-callout", "vests-per-heat", "fixed-lycra-per-rider", "bib-numbers", "kites-no-vests", "brand-launch-same-kites"]);
    expect(all.every((s) => s.palette.length === 10)).toBe(true);
    expect(defaultScheme().id).toBe("name-callout"); // nothing may be assumed to be handed out
    expect(lycraScheme().id).toBe("vests-per-heat");
    expect(usesLycras(lycraScheme())).toBe(true);
    expect(usesLycras(defaultScheme())).toBe(false);
  });

  it("rejects duplicate colour names and a fallback equal to the primary", () => {
    const s = defaultScheme();
    const dup = IdentificationSchemeSchema.safeParse({ ...s, palette: [...s.palette, { key: "red2", label: "Red", hex: "#ff0000" }] });
    expect(dup.success).toBe(false);
    const fb = IdentificationSchemeSchema.safeParse({ ...s, fallbackPrimary: s.primary });
    expect(fb.success).toBe(false);
  });

  it("rejects a colour that is not a hex code", () => {
    const s = defaultScheme();
    expect(IdentificationSchemeSchema.safeParse({ ...s, palette: [{ key: "x", label: "X", hex: "red" }] }).success).toBe(false);
  });
});

describe("event form", () => {
  it("accepts a normal event and fills the defaults", () => {
    const r = EventFormSchema.parse(base);
    expect(r.settings.publicLiveScores).toBe("after_publish");
    expect(r.settings.registrationOpen).toBe(false);
    expect(r.settings.livePollSec).toBe(7);
  });

  it("visibility: every option is off by default (nothing is shown until the head judge publishes)", () => {
    const r = EventFormSchema.parse(base);
    expect(r.settings.publicLiveScores).not.toBe("live");
    expect(r.settings.publicResultsOnPublish).toBe(false);
    expect(r.settings.holdFinalResult).toBe(false);
  });

  it("explains a last day before the first day", () => {
    const r = EventFormSchema.safeParse({ ...base, end_date: "2026-10-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/cannot be before/);
  });

  it("registration cannot close after the event", () => {
    const r = EventFormSchema.safeParse({ ...base, settings: { registrationOpen: true, registrationClosesOn: "2026-10-09" } });
    expect(r.success).toBe(false);
  });

  it("keeps settings written by later phases", () => {
    const s = parseEventSettings({ publicLiveScores: "live", somethingNew: 5 });
    expect((s as Record<string, unknown>).somethingNew).toBe(5);
  });

  it("slugify makes a web address", () => {
    expect(slugify("Arrow Big Air 2026!")).toBe("arrow-big-air-2026");
    expect(slugify("  Été à Gouna ")).toBe("ete-a-gouna");
  });
});

describe("organisation settings", () => {
  it("time zones are checked", () => {
    expect(isValidTimeZone("Africa/Cairo")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
  it("a broken settings object falls back to Cairo", () => {
    expect(parseOrgSettings({ defaultTimezone: "Nope" }).defaultTimezone).toBe("Africa/Cairo");
    expect(parseOrgSettings(null).defaultTimezone).toBe("Africa/Cairo");
  });
  it("slug rules match the database", () => {
    expect(OrgSlugSchema.safeParse("arrow").success).toBe(true);
    expect(OrgSlugSchema.safeParse("Arrow Big Air").success).toBe(false);
    expect(OrgSlugSchema.safeParse("-x").success).toBe(false);
  });
});

import { blankEventValues, valuesFromRow } from "./event-values";
describe("event form starting values", () => {
  it("a blank event starts with the organisation's time zone, the default scheme and everything closed", () => {
    const v = blankEventValues("Europe/Berlin");
    expect(v.timezone).toBe("Europe/Berlin");
    expect(v.settings.identification?.scheme.id).toBe("name-callout");
    expect(v.settings.registrationOpen).toBe(false);
    expect(EventFormSchema.safeParse({ ...v, name: "Arrow", slug: "arrow" }).success).toBe(true);
  });
  it("a saved row without an identification scheme gets the default one", () => {
    const v = valuesFromRow({ name: "Old", slug: "old", location: null, timezone: "Africa/Cairo", start_date: null, end_date: null, settings: { publicLiveScores: "live" }, branding: {} });
    expect(v.settings.publicLiveScores).toBe("live");
    expect(v.settings.identification?.basedOn).toBe("name-callout");
  });
});

describe("registration settings", () => {
  const form = (settings: object) => EventFormSchema.safeParse({ ...base, settings });
  it("has sensible defaults: closed, no time, no maximum, no message", () => {
    const s = parseEventSettings({});
    expect(s.registrationOpen).toBe(false);
    expect(s.registrationClosesOn ?? null).toBeNull();
    expect(s.registrationClosesTime ?? null).toBeNull();
    expect(s.registrationMaxPerDivision ?? null).toBeNull();
    expect(s.registrationClosedMessage ?? "").toBe("");
  });
  it("accepts a closing date with a time, a maximum per division and a message", () => {
    const r = form({ registrationOpen: true, registrationClosesOn: "2026-10-01", registrationClosesTime: "18:30", registrationMaxPerDivision: 24, registrationClosedMessage: "Registration is closed: email us." });
    expect(r.success).toBe(true);
  });
  it("a closing time needs a closing date", () => {
    const r = form({ registrationOpen: true, registrationClosesTime: "18:30" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.join(".") === "settings.registrationClosesOn")).toBe(true);
  });
  it("the time is HH:MM, the maximum a whole number of 1 or more, the message short", () => {
    expect(form({ registrationClosesOn: "2026-10-01", registrationClosesTime: "6pm" }).success).toBe(false);
    expect(form({ registrationMaxPerDivision: 0 }).success).toBe(false);
    expect(form({ registrationMaxPerDivision: 2.5 }).success).toBe(false);
    expect(form({ registrationClosedMessage: "x".repeat(301) }).success).toBe(false);
  });
});
