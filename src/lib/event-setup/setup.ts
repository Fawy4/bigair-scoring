// Builds an event from its description through the app's own save functions (RB1). This file decides WHAT to do and in which order; the Gateway (scripts/event-setup)
// does it by calling the same actions the organiser's setup steps call. Every step looks first and only creates what is missing, so running it twice builds nothing twice.
import { formatTemplateFor } from "./ladder";
import type { EventDescription } from "./schema";
import { eventFormFor, pickOrganisation, splitName } from "./settings";

export interface People {
  /** seed number → full name; seeds that are not here stay "Rider n" */
  riders: Record<string, string>;
  /** the official's key in the description (head, judge1 …) → full name */
  officials: Record<string, string>;
}

export interface DivisionState {
  id: string;
  name: string;
  scoringModelId: string | null;
  scoringOverrides: unknown;
  formatTemplateId: string | null;
  drawn: boolean;
  locked: boolean;
}
export interface EntryState {
  entryId: string;
  riderId: string;
  seed: number | null;
  first: string;
  last: string;
}
export interface SeatState {
  id: string;
  name: string;
  role: string;
}

export interface Gateway {
  organisations(): Promise<Array<{ id: string; name: string; slug: string }>>;
  findEvent(orgId: string, slug: string): Promise<{ id: string } | null>;
  createEvent(orgId: string, form: unknown): Promise<{ id: string }>;
  divisions(eventId: string): Promise<DivisionState[]>;
  addDivision(eventId: string, name: string): Promise<{ id: string }>;
  scoringModelId(key: string): Promise<string>;
  formatPresetId(orgId: string, name: string): Promise<string | null>;
  saveFormatPreset(orgId: string, name: string, json: unknown): Promise<string>;
  setDivisionScoring(divisionId: string, presetId: string, overrides: unknown): Promise<void>;
  setDivisionFormat(divisionId: string, presetId: string): Promise<void>;
  entries(divisionId: string): Promise<EntryState[]>;
  addRider(divisionId: string, first: string, last: string): Promise<void>;
  renameRider(riderId: string, first: string, last: string): Promise<void>;
  generateDraw(divisionId: string): Promise<void>;
  lockDraw(divisionId: string): Promise<void>;
  seats(eventId: string): Promise<SeatState[]>;
  addSeat(eventId: string, name: string, role: "head" | "judge" | "spotter" | "observer"): Promise<{ id: string }>;
  panel(divisionId: string): Promise<string[]>;
  setPanel(divisionId: string, seatIds: string[]): Promise<void>;
  heats(eventId: string): Promise<Array<{ id: string; number: number }>>;
  runOrder(eventId: string, day: string, name: string): Promise<{ id: string; heats: number } | null>;
  createRunOrder(eventId: string, day: string, name: string): Promise<{ id: string }>;
  fillRunOrder(planId: string, heatIds: string[], breaks: { afterHeatMin: number; afterRoundMin: number }): Promise<void>;
}

export interface Line {
  step: string;
  did: "created" | "kept" | "changed";
  detail: string;
}
export interface SetupResult {
  orgId: string;
  orgName: string;
  eventId: string;
  divisionId: string;
  lines: Line[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

export async function setupEvent(g: Gateway, desc: EventDescription, people: People, onlyOrgId?: string): Promise<SetupResult> {
  const lines: Line[] = [];
  const say = (step: string, did: Line["did"], detail: string) => lines.push({ step, did, detail });

  // 1. the organisation: it must already exist; nothing about it is changed
  const orgs = await g.organisations();
  const org = onlyOrgId ? orgs.find((o) => o.id === onlyOrgId) : pickOrganisation(orgs, desc.organisation.nameContains);
  if (!org) throw new Error("The organisation to build in was not found.");
  say("Organisation", "kept", `${org.name} (unchanged)`);

  // 2. the event
  const existing = await g.findEvent(org.id, desc.event.slug);
  const eventId = existing ? existing.id : (await g.createEvent(org.id, eventFormFor(desc))).id;
  say("Event", existing ? "kept" : "created", `${desc.event.name}, draft (not public)`);

  // 3. the division
  const wantedName = desc.division.name;
  let division = (await g.divisions(eventId)).find((d) => d.name === wantedName);
  if (!division) {
    const made = await g.addDivision(eventId, wantedName);
    division = (await g.divisions(eventId)).find((d) => d.id === made.id)!;
    say("Division", "created", wantedName);
  } else say("Division", "kept", wantedName);
  const divisionId = division.id;

  // 4. scoring (the KOTA preset with the rulebook's tie-break) and the ladder
  const modelId = await g.scoringModelId(desc.division.scoring.preset);
  if (division.scoringModelId !== modelId || !sameJson(division.scoringOverrides, desc.division.scoring.overrides)) {
    await g.setDivisionScoring(divisionId, modelId, desc.division.scoring.overrides);
    say("Scoring", "changed", `${desc.division.scoring.preset}, ties to the head judge`);
  } else say("Scoring", "kept", desc.division.scoring.preset);

  const template = formatTemplateFor(desc);
  let formatId = await g.formatPresetId(org.id, template.name);
  if (!formatId) {
    formatId = await g.saveFormatPreset(org.id, template.name, template);
    say("Ladder", "created", `${template.name}`);
  } else say("Ladder", "kept", template.name);
  if (division.formatTemplateId !== formatId) {
    await g.setDivisionFormat(divisionId, formatId);
    say("Ladder", "changed", "applied to the division");
  }

  // 5. the riders: seed n is "Rider n" until its name is given; a name given later renames the same rider in place
  const entries = await g.entries(divisionId);
  const bySeed = new Map(entries.map((e) => [e.seed, e]));
  let added = 0;
  let renamed = 0;
  for (let seed = 1; seed <= desc.division.riders; seed++) {
    const wanted = people.riders[String(seed)] ? splitName(people.riders[String(seed)]) : { first: desc.division.riderPlaceholder.replace("{n}", "").trim(), last: String(seed) };
    const have = bySeed.get(seed);
    if (!have) {
      await g.addRider(divisionId, wanted.first, wanted.last);
      added++;
    } else if (people.riders[String(seed)] && (have.first !== wanted.first || have.last !== wanted.last)) {
      await g.renameRider(have.riderId, wanted.first, wanted.last);
      renamed++;
    }
  }
  say("Riders", added ? "created" : renamed ? "changed" : "kept", `${added} added, ${renamed} renamed, ${desc.division.riders} in the division`);

  // 6. the draw: every seed in the seat of the sheet, then locked
  const fresh = (await g.divisions(eventId)).find((d) => d.id === divisionId)!;
  if (!fresh.drawn) {
    await g.generateDraw(divisionId);
    say("Draw", "created", "every seed placed in its seat");
  } else say("Draw", "kept", "already drawn");
  if (!fresh.locked) {
    await g.lockDraw(divisionId);
    say("Draw", "changed", "locked");
  }

  // 7. the officials; the reserve judge is not on the panel
  const seats = await g.seats(eventId);
  const panelIds: string[] = [];
  for (const o of desc.officials) {
    const name = o.role === "spotter" || o.role === "observer" ? o.name : nameOf(o, people);
    let seat = seats.find((s) => s.role === o.role && s.name === name);
    if (!seat) {
      seat = { ...(await g.addSeat(eventId, name, o.role)), name, role: o.role };
      say("Officials", "created", `${o.role} seat ${"key" in o ? o.key : name}`);
    }
    if (o.role === "judge" && o.panel) panelIds.push(seat.id);
  }
  const current = await g.panel(divisionId);
  if (!sameSet(current, panelIds)) {
    await g.setPanel(divisionId, panelIds);
    say("Panel", "changed", `${panelIds.length} judges score; the reserve seat is ready but not on the panel`);
  } else say("Panel", "kept", `${panelIds.length} judges score`);

  // 8. the run order of the first day: H1 → H22, a start sequence before each heat and no other breaks; no start time (the owner sets it on the day)
  const plan = (await g.runOrder(eventId, desc.runOrder.day, desc.runOrder.name)) ?? null;
  const heats = (await g.heats(eventId)).sort((a, b) => a.number - b.number);
  if (!plan || plan.heats < heats.length) {
    const planId = plan ? plan.id : (await g.createRunOrder(eventId, desc.runOrder.day, desc.runOrder.name)).id;
    await g.fillRunOrder(planId, heats.map((h) => h.id), { afterHeatMin: desc.runOrder.breakAfterHeatMin, afterRoundMin: desc.runOrder.breakAfterRoundMin });
    say("Run order", plan ? "changed" : "created", `${heats.length} heats, ${desc.runOrder.name}`);
  } else say("Run order", "kept", `${plan.heats} heats`);

  return { orgId: org.id, orgName: org.name, eventId, divisionId, lines };
}

function nameOf(o: EventDescription["officials"][number], people: People): string {
  if (o.role !== "head" && o.role !== "judge") throw new Error("Not a named seat.");
  const base = people.officials[o.key];
  if (!base) throw new Error(`The names file has no name for “${o.key}”.`);
  return `${base.trim()}${o.role === "judge" ? (o.nameSuffix ?? "") : ""}`.slice(0, 60);
}
