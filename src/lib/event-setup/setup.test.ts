// RB1 — the setup run: it builds once, a second run builds nothing, a later name renames the same rider, and nothing personal is in the repository.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { EventSettingsSchema } from "@/lib/schemas/event-settings";
import { parseScoringModel } from "@/lib/schemas/scoring-model";
import { parseEventDescription } from "./schema";
import { setupEvent, type DivisionState, type EntryState, type Gateway, type People, type SeatState } from "./setup";
import { eventFormFor, flagSettingsFor, lycraSchemeFor, pickOrganisation, splitName } from "./settings";

const FILE = "presets/events/red-bull-winds-of-sinai-2026.json";
const description = () => parseEventDescription(JSON.parse(readFileSync(FILE, "utf8")));

/** An in-memory stand-in for the app's save functions that counts every write. */
function fakeGateway(orgs = [{ id: "org-1", name: "Redbull", slug: "redbull" }]) {
  const writes: string[] = [];
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const events: Array<{ id: string; orgId: string; slug: string }> = [];
  const divisions: Array<DivisionState & { eventId: string }> = [];
  const formats: Array<{ id: string; name: string }> = [];
  const entries: Array<EntryState & { divisionId: string }> = [];
  const seats: Array<SeatState & { eventId: string }> = [];
  const panels = new Map<string, string[]>();
  const plans: Array<{ id: string; eventId: string; day: string; name: string; heats: string[] }> = [];
  const heats: Array<{ id: string; eventId: string; number: number }> = [];
  const w = (s: string) => writes.push(s);
  const gateway: Gateway = {
    organisations: async () => orgs,
    findEvent: async (orgId, slug) => events.find((e) => e.orgId === orgId && e.slug === slug) ?? null,
    createEvent: async (orgId, form) => {
      w("createEvent");
      const e = { id: id("event"), orgId, slug: (form as { slug: string }).slug };
      events.push(e);
      return e;
    },
    divisions: async (eventId) => divisions.filter((d) => d.eventId === eventId),
    addDivision: async (eventId, name) => {
      w("addDivision");
      const d = { id: id("division"), eventId, name, scoringModelId: null, scoringOverrides: {}, formatTemplateId: null, drawn: false, locked: false };
      divisions.push(d);
      return d;
    },
    scoringModelId: async () => "model-kota",
    formatPresetId: async (_o, name) => formats.find((f) => f.name === name)?.id ?? null,
    saveFormatPreset: async (_o, name) => {
      w("saveFormatPreset");
      const f = { id: id("format"), name };
      formats.push(f);
      return f.id;
    },
    setDivisionScoring: async (divisionId, presetId, overrides) => {
      w("setDivisionScoring");
      Object.assign(divisions.find((d) => d.id === divisionId)!, { scoringModelId: presetId, scoringOverrides: overrides });
    },
    setDivisionFormat: async (divisionId, presetId) => {
      w("setDivisionFormat");
      divisions.find((d) => d.id === divisionId)!.formatTemplateId = presetId;
    },
    entries: async (divisionId) => entries.filter((e) => e.divisionId === divisionId),
    addRider: async (divisionId, first, last) => {
      w("addRider");
      entries.push({ divisionId, entryId: id("entry"), riderId: id("rider"), seed: entries.filter((e) => e.divisionId === divisionId).length + 1, first, last });
    },
    renameRider: async (riderId, first, last) => {
      w("renameRider");
      Object.assign(entries.find((e) => e.riderId === riderId)!, { first, last });
    },
    generateDraw: async (divisionId) => {
      w("generateDraw");
      divisions.find((d) => d.id === divisionId)!.drawn = true;
      for (let i = 1; i <= 22; i++) heats.push({ id: id("heat"), eventId: divisions.find((d) => d.id === divisionId)!.eventId, number: i });
    },
    lockDraw: async (divisionId) => {
      w("lockDraw");
      divisions.find((d) => d.id === divisionId)!.locked = true;
    },
    seats: async (eventId) => seats.filter((s) => s.eventId === eventId),
    addSeat: async (eventId, name, role) => {
      w("addSeat");
      const s = { id: id("seat"), eventId, name, role };
      seats.push(s);
      return s;
    },
    panel: async (divisionId) => panels.get(divisionId) ?? [],
    setPanel: async (divisionId, ids) => {
      w("setPanel");
      panels.set(divisionId, ids);
    },
    heats: async (eventId) => heats.filter((h) => h.eventId === eventId),
    runOrder: async (eventId, day, name) => {
      const p = plans.find((x) => x.eventId === eventId && x.day === day && x.name === name);
      return p ? { id: p.id, heats: p.heats.length } : null;
    },
    createRunOrder: async (eventId, day, name) => {
      w("createRunOrder");
      const p = { id: id("plan"), eventId, day, name, heats: [] as string[] };
      plans.push(p);
      return p;
    },
    fillRunOrder: async (planId, heatIds) => {
      w("fillRunOrder");
      plans.find((p) => p.id === planId)!.heats = heatIds;
    },
  };
  return { gateway, writes, entries, seats, panels, events, divisions, plans };
}

const people = (): People => ({
  riders: { "1": "Alpha One", "2": "Bravo Two", "3": "Charlie Three Junior" },
  officials: { head: "Head Person", judge1: "Judge One", judge2: "Judge Two", judge3: "Judge Three", judge4: "Judge Four" },
});

describe("RB1 the setup run", () => {
  it("builds the event once: one event, one division, 18 riders, seven seats, a locked draw and a 22-heat run order", async () => {
    const f = fakeGateway();
    const r = await setupEvent(f.gateway, description(), people());
    expect(r.orgName).toBe("Redbull");
    expect(f.events).toHaveLength(1);
    expect(f.divisions).toHaveLength(1);
    expect(f.divisions[0]).toMatchObject({ drawn: true, locked: true, scoringModelId: "model-kota" });
    expect(f.entries).toHaveLength(18);
    expect(f.entries.map((e) => e.seed)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(f.entries[6]).toMatchObject({ first: "Rider", last: "7" });
    expect(f.entries[17]).toMatchObject({ first: "Rider", last: "18" });
    expect(f.entries[2]).toMatchObject({ first: "Charlie", last: "Three Junior" });
    expect(f.seats.map((s) => s.role)).toEqual(["head", "judge", "judge", "judge", "judge", "spotter", "observer"]);
    expect(f.seats[4].name).toBe("Judge Four (reserve)");
    expect(f.plans[0].heats).toHaveLength(22);
  });

  it("keeps the reserve judge off the panel: the three scoring judges only, never the head judge or the reserve", async () => {
    const f = fakeGateway();
    await setupEvent(f.gateway, description(), people());
    const ids = f.panels.get(f.divisions[0].id)!;
    expect(ids).toHaveLength(3);
    const names = f.seats.filter((s) => ids.includes(s.id)).map((s) => s.name);
    expect(names).toEqual(["Judge One", "Judge Two", "Judge Three"]);
  });

  it("run twice builds nothing the second time", async () => {
    const f = fakeGateway();
    await setupEvent(f.gateway, description(), people());
    const before = [...f.writes];
    const again = await setupEvent(f.gateway, description(), people());
    expect(f.writes).toEqual(before);
    expect(again.lines.every((l) => l.did === "kept")).toBe(true);
    expect(f.events).toHaveLength(1);
    expect(f.entries).toHaveLength(18);
    expect(f.seats).toHaveLength(7);
  });

  it("a run that stopped half way carries on from where it stopped", async () => {
    const f = fakeGateway();
    const g = { ...f.gateway, generateDraw: async () => { throw new Error("network"); } };
    await expect(setupEvent(g, description(), people())).rejects.toThrow("network");
    expect(f.entries).toHaveLength(18);
    await setupEvent(f.gateway, description(), people());
    expect(f.events).toHaveLength(1);
    expect(f.entries).toHaveLength(18);
    expect(f.divisions[0].locked).toBe(true);
  });

  it("names that arrive later rename the same riders in place (same records, same seeds)", async () => {
    const f = fakeGateway();
    await setupEvent(f.gateway, description(), { ...people(), riders: {} });
    const ids = f.entries.map((e) => e.riderId);
    const seeds = f.entries.map((e) => e.seed);
    const later: People = { ...people(), riders: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 7), `Late Name${i + 7}`])) };
    await setupEvent(f.gateway, description(), later);
    expect(f.entries.map((e) => e.riderId)).toEqual(ids);
    expect(f.entries.map((e) => e.seed)).toEqual(seeds);
    expect(f.entries[6]).toMatchObject({ first: "Late", last: "Name7" });
    expect(f.entries[17]).toMatchObject({ first: "Late", last: "Name18" });
    expect(f.writes.filter((x) => x === "renameRider")).toHaveLength(12);
    expect(f.writes.filter((x) => x === "addRider")).toHaveLength(18);
  });

  it("stops when the official's name is missing from the names file", async () => {
    const f = fakeGateway();
    await expect(setupEvent(f.gateway, description(), { riders: {}, officials: {} })).rejects.toThrow(/names file/);
  });

  it("builds in the organisation that exists and creates no organisation", async () => {
    const f = fakeGateway([{ id: "o1", name: "Redbull", slug: "redbull" }, { id: "o2", name: "Arrow", slug: "arrow" }]);
    const r = await setupEvent(f.gateway, description(), people());
    expect(r.orgId).toBe("o1");
    expect(f.events[0].orgId).toBe("o1");
  });
});

describe("RB1 choosing the organisation", () => {
  const all = [
    { id: "1", name: "Arrow", slug: "arrow" },
    { id: "2", name: "Redbull", slug: "redbull" },
    { id: "3", name: "EKL", slug: "ekl" },
  ];
  it("finds “Redbull” for “red bull” (spaces and capitals do not matter)", () => expect(pickOrganisation(all, "red bull").id).toBe("2"));
  it("stops when none matches", () => expect(() => pickOrganisation(all, "monster")).toThrow(/No organisation/));
  it("stops when two match, and says which", () => {
    expect(() => pickOrganisation([...all, { id: "4", name: "Red Bull Kite", slug: "rb-kite" }], "red bull")).toThrow(/More than one.*Redbull.*Red Bull Kite/);
  });
  it("splits a name at the first space", () => {
    expect(splitName("Noah El Dali")).toEqual({ first: "Noah", last: "El Dali" });
    expect(() => splitName("Madonna")).toThrow();
  });
});

describe("RB1 the event's own settings", () => {
  const d = description();
  it("is a draft in Dahab on Sunday 18 and Monday 19 October 2026, Cairo time zone", () => {
    const f = eventFormFor(d);
    expect(d.event.status).toBe("draft");
    expect([f.name, f.location, f.start_date, f.end_date, f.timezone]).toEqual(["Red Bull Winds of Sinai 2026", "Blue Lagoon, Dahab", "2026-10-18", "2026-10-19", "Africa/Cairo"]);
    expect(new Date("2026-10-18T12:00:00Z").getUTCDay()).toBe(0); // a Sunday
  });
  it("uses one Lycra list Blue, Yellow, White in seat order", () => {
    expect(lycraSchemeFor(d).palette.map((c) => c.label)).toEqual(["Blue", "Yellow", "White"]);
    expect(lycraSchemeFor(d)).toMatchObject({ primary: "vest_colour", vestAssignment: "per_heat_slot" });
  });
  it("sets the flags: red 3:00 before start, blue running, light last minute, red stopped; on", () => {
    const flags = flagSettingsFor(d);
    expect(flags).toMatchObject({ enabled: true, prestartSec: 180, lastMinuteSec: 60 });
    expect(flags.states.before_start.colour).toBe(flags.states.stopped.colour);
    expect(flags.states.running.label).toBe("Blue — heat on");
    expect(flags.states.last_minute.label).toBe("No flag — last minute");
    expect(flags.states.stopped.label).toBe("Red — heat over");
    expect(EventSettingsSchema.parse(eventFormFor(d).settings).flags.states.before_start.label.length).toBeLessThanOrEqual(24);
  });
  it("names the separate score “Impression”", () => expect(eventFormFor(d).settings.impressionName).toBe("Impression"));
});

describe("RB1 the scoring of the division", () => {
  const preset = JSON.parse(readFileSync("presets/scoring/kota-best3-impression.json", "utf8"));
  const rules = () => parseScoringModel(mergeOverrides(preset, description().division.scoring.overrides, SCORING_NULLABLE));
  it("is the KOTA preset: every trick 0–10 per judge, best 3 tricks + one Impression, the four counting evenly", () => {
    const m = rules();
    expect(m.trick.scale).toMatchObject({ min: 0, max: 10 });
    expect(m.heat.counting).toMatchObject({ type: "best_n", n: 3 });
    expect(m.heat.impression).toMatchObject({ label: "Impression", weight: 1 });
    expect(m.heat.trickWeight).toBe(1);
  });
  it("lets the same trick count more than once and has no attempt limit", () => {
    const m = rules();
    expect((m.heat.counting as { distinctTrickNames?: boolean }).distinctTrickNames ?? false).toBe(false);
    expect(m.heat.maxAttemptsPerRider).toBeNull();
  });
  it("gives ties to the head judge only", () => expect(rules().tieBreakers).toEqual(["head_judge"]));
});

describe("RB1 no personal details in the repository", () => {
  const text = readFileSync(FILE, "utf8");
  it("the description holds no rider or official names and no e-mail addresses or PINs", () => {
    expect(text).not.toMatch(/@/);
    const d = description();
    const names = d.officials.flatMap((o) => ("name" in o ? [o.name] : []));
    expect(names.sort()).toEqual(["Event manager", "Spotter"]);
    expect(text).not.toMatch(/"riders":\s*\{/);
    expect(text).not.toMatch(/\bpin\b/i);
  });
});

describe("RB1 reading a draw back in the sheet's notation", () => {
  it("reads the drawn event heat for heat in the same words as the sheet", async () => {
    const { sheetOfDraw } = await import("./sheet");
    const { ladderToDraw } = await import("@/lib/engine/ladder/custom-ladder-draw");
    const { makeEntrants } = await import("@/lib/engine/ladder/fixtures");
    const { formatTemplateFor } = await import("./ladder");
    const sheet = sheetOfDraw(ladderToDraw(formatTemplateFor(description()), makeEntrants(18)));
    expect(Object.keys(sheet)).toHaveLength(22);
    expect(sheet[1]).toEqual(["seed 5", "seed 12", "seed 16"]);
    expect(sheet[10]).toEqual(["3rd H2", "2nd H6"]);
    expect(sheet[22]).toEqual(["1st H19", "1st H20", "1st H21"]);
  });
});
