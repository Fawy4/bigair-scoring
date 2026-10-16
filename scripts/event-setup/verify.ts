// Reads the built event back from the database and checks it against the event description and the owner's list. Prints no names and no PINs.
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DivisionDraw } from "../../src/lib/engine/ladder";
import { checkLadder } from "../../src/lib/engine/ladder/custom-ladder-check";
import { computeTimetable } from "../../src/lib/engine/schedule";
import { divisionPlacings } from "../../src/lib/engine/ladder";
import { publishAll } from "../../src/lib/engine/ladder/fixtures";
import { ladderFromDescription } from "../../src/lib/event-setup/ladder";
import type { EventDescription } from "../../src/lib/event-setup/schema";
import { coloursOfDraw, sheetOfDraw } from "../../src/lib/event-setup/sheet";
import { flagSettingsFor } from "../../src/lib/event-setup/settings";
import { planOfRow } from "../../src/lib/schedule/plans";
import { parseEventSettings } from "../../src/lib/schemas/event-settings";
import { parseScoringModel } from "../../src/lib/schemas/scoring-model";
import { mergeOverrides, SCORING_NULLABLE } from "../../src/lib/scoring-ui/overrides";

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

// same content whatever the order of the keys (the database stores objects with its own key order)
const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));

export async function verifyEvent(db: SupabaseClient, desc: EventDescription, eventId: string, expectedNamed: number): Promise<{ checks: Check[]; colourNotes: string[] }> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are read untyped and checked field by field below
  const one = async (q: PromiseLike<{ data: any; error: { message: string } | null }>): Promise<any> => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const many = async (q: PromiseLike<{ data: any; error: { message: string } | null }>): Promise<Row[]> => ((await one(q)) ?? []) as Row[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  const event = await one(db.from("events").select("name, slug, location, timezone, start_date, end_date, status, settings, is_simulation").eq("id", eventId).maybeSingle());
  if (!event) throw new Error("The event is not there.");
  const settings = parseEventSettings(event.settings);
  add("Event name, place, dates and time zone", event.name === desc.event.name && event.location === desc.event.location && event.start_date === desc.event.startDate && event.end_date === desc.event.endDate && event.timezone === desc.event.timezone, `${event.start_date} → ${event.end_date}, ${event.timezone}`);
  add("Event is a draft (not public)", event.status === "draft" && !event.is_simulation, `status ${event.status}`);
  add("Flags on, with the colours and labels", same(settings.flags, flagSettingsFor(desc)), `start sequence ${settings.flags.prestartSec} s, last minute ${settings.flags.lastMinuteSec} s`);
  add("Lycra list is Blue, Yellow, White", same(settings.identification?.scheme.palette.map((c) => c.key), desc.lycra) && settings.identification?.scheme.primary === "vest_colour");
  add("The separate score is called “Impression”", settings.impressionName === desc.event.impressionName);

  const divisions = await many(db.from("divisions").select("id, name, scoring_model_id, scoring_overrides, format_template_id, draw, draw_locked_at, panel_id").eq("event_id", eventId));
  add("One division", divisions.length === 1 && divisions[0].name === desc.division.name, `${divisions.length} division(s)`);
  const div = divisions[0];

  const model = await one(db.from("scoring_models").select("key, version, json").eq("id", div.scoring_model_id ?? "").maybeSingle());
  const rules = model ? parseScoringModel(mergeOverrides(model.json as never, div.scoring_overrides, SCORING_NULLABLE)) : null;
  add("KOTA scoring: best 3 tricks + one Impression, counting evenly", model?.key === desc.division.scoring.preset && rules?.heat.counting.type === "best_n" && (rules.heat.counting as { n?: number }).n === 3 && rules.heat.impression?.weight === rules.heat.trickWeight && rules.heat.impression?.label === "Impression", `${model?.key} v${model?.version}`);
  add("Same trick may count more than once", !((rules?.heat.counting as { distinctTrickNames?: boolean } | undefined)?.distinctTrickNames ?? false));
  add("No attempt limit", rules?.heat.maxAttemptsPerRider === null);
  add("Ties go to the head judge", same(rules?.tieBreakers, ["head_judge"]));

  const format = await one(db.from("format_templates").select("name, json").eq("id", div.format_template_id ?? "").maybeSingle());
  const wanted = ladderFromDescription(desc.ladder);
  add("The saved ladder is the custom ladder of the description", same((format?.json as { ladder?: unknown } | undefined)?.ladder, wanted));

  const entries = await many(db.from("entries").select("seed, status, riders(first_name, last_name)").eq("division_id", div.id).order("seed"));
  add("18 riders, seeds 1–18, all taking part", entries.length === desc.division.riders && entries.every((e, i) => e.seed === i + 1 && e.status === "confirmed"), `${entries.length} riders`);
  const placeholders = entries.filter((e) => e.riders?.first_name === "Rider").length;
  add("Names given are in place; the rest are “Rider n”", placeholders === desc.division.riders - expectedNamed, `${desc.division.riders - placeholders} named, ${placeholders} placeholders`);

  const draw = div.draw as unknown as DivisionDraw | null;
  add("The draw is locked", Boolean(draw) && div.draw_locked_at !== null);
  const sheet = draw ? sheetOfDraw(draw) : {};
  const wantedSheet = Object.fromEntries(desc.ladder.rounds.flatMap((r) => r.heats).map((h) => [h.number, h.seats]));
  add("All 22 heats sit exactly as on the printed sheet (every seed and place)", same(sheet, wantedSheet), `${Object.keys(sheet).length} heats`);
  if (draw) {
    const names = new Map(draw.entrants.map((e) => [e.id, e.name]));
    void names;
    const check = checkLadder(wanted, draw.entrants.map((e) => ({ id: e.id, name: e.name })));
    add("The ladder checker is green", check.complete && check.faults.length === 0, check.status);
    const staged = publishAll(JSON.parse(JSON.stringify(draw)) as DivisionDraw);
    const labels = divisionPlacings(staged).map((p) => p.label);
    const n = (l: string) => labels.filter((x) => x === l).length;
    add("Placings come out 1, 2, 3 · 4= (3) · 7= (6) · 13= (6)", labels.length === 18 && n("1") === 1 && n("2") === 1 && n("3") === 1 && n("4=") === 3 && n("7=") === 6 && n("13=") === 6);
  }

  const heats = await many(db.from("heats").select("id, number, duration_sec, warm_up_sec, round_id").eq("event_id", eventId).order("number"));
  const roundOf = (n: number) => desc.ladder.rounds.find((r) => r.heats.some((h) => h.number === n))!;
  add("22 heats, each the right length with its start sequence", heats.length === 22 && heats.every((h) => h.duration_sec === roundOf(h.number).heatLengthMin * 60 && h.warm_up_sec === roundOf(h.number).startSequenceMin * 60), "10 / 8 / 8 / 8 / 12 min, 3 min start sequence");

  const plans = await many(db.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, hand_pins").eq("event_id", eventId));
  const row = plans.find((p) => p.day === desc.runOrder.day && p.name === desc.runOrder.name);
  const items = (row?.items as Array<{ kind: string; heatId?: string }> | undefined) ?? [];
  const order = items.filter((i) => i.kind === "heat").map((i) => heats.find((h) => h.id === i.heatId)?.number);
  add("Run order is H1 → H22 in order, no breaks, no start time set", Boolean(row) && same(order, Array.from({ length: 22 }, (_, i) => i + 1)) && items.length === 22 && Object.keys((row?.anchors as object) ?? {}).length === 0);
  add("Run order breaks are 0 + 0", same(row?.defaults, { breakAfterHeatMin: desc.runOrder.breakAfterHeatMin, breakAfterRoundMin: desc.runOrder.breakAfterRoundMin }));
  if (row && draw) {
    const byNumber = new Map(draw.rounds.flatMap((r) => r.heats).map((h) => [h.number, h]));
    const lives = heats.map((h) => {
      const d = byNumber.get(h.number)!;
      return { heatId: h.id, durationMin: h.duration_sec / 60, warmUpMin: h.warm_up_sec / 60, roundLast: d.roundLast, breakAfterHeatMin: d.breakAfterHeatMin, breakAfterRoundMin: d.breakAfterRoundMin };
    });
    const plan = planOfRow(row as never);
    // a start time is NOT saved: this only shows how the day adds up if H1 starts at 07:00
    const trial = { ...plan, anchors: { [plan.items[0].id]: "07:00" } };
    const t = computeTimetable(trial, lives, { timezone: desc.event.timezone, eventDay: desc.runOrder.day, defaults: { breakAfterHeatMin: 0, breakAfterRoundMin: 0, readyCallMin: 15 } });
    const first = t.rows[0];
    const minutes = first.warmUpStartUtc && t.finishUtc ? (Date.parse(t.finishUtc) - Date.parse(first.warmUpStartUtc)) / 60000 : NaN;
    add("The day adds up to 4 h 18 min (first start sequence to last heat end)", minutes === desc.runOrder.expectedMinutes, `H1 start sequence ${first.warmUpStart}, H1 start ${first.start}, H22 ends ${t.finish} → ${Math.floor(minutes / 60)} h ${minutes % 60} min`);
  }

  const seats = await many(db.from("judge_seats").select("id, name, role, scores, active, status, pin_hash, pin_enc").eq("event_id", eventId));
  const count = (role: string) => seats.filter((s) => s.role === role).length;
  add("Seats: 1 head judge, 4 judges, 1 spotter, 1 observer", count("head") === 1 && count("judge") === 4 && count("spotter") === 1 && count("observer") === 1 && seats.length === 7);
  add("Every seat is active and has a PIN ready", seats.every((s) => s.active && s.status === "active" && s.pin_hash && s.pin_enc));
  const head = seats.find((s) => s.role === "head");
  add("Head judge does not score", head?.scores === false);
  const members: Row[] = div.panel_id ? await many(db.from("panel_members").select("judge_seat_id, seat_no").eq("panel_id", div.panel_id).order("seat_no")) : [];
  const memberSeats = members.map((m) => seats.find((s) => s.id === m.judge_seat_id));
  add("The panel is the three scoring judges", members.length === 3 && memberSeats.every((s) => s?.role === "judge"), `${members.length} on the panel`);
  const reserve = seats.find((s) => s.role === "judge" && /\(reserve\)$/.test(s.name));
  add("The reserve judge is ready, active, and not on the panel", Boolean(reserve) && reserve!.active && !members.some((m) => m.judge_seat_id === reserve!.id));

  // Seat colours: the app has ONE list for every heat (seat 1 = first colour). Compare with the printed sheet's seat colours.
  const colourNotes: string[] = [];
  if (draw) {
    const app = coloursOfDraw(draw);
    const sheetColours: Record<string, string[]> = { R1: ["blue", "yellow", "white"], R2: ["blue", "white"], R3: ["yellow", "white"], R4: ["yellow", "blue"], R5: ["white", "blue", "yellow"] };
    for (const r of desc.ladder.rounds) {
      const h = r.heats[0].number;
      const have = app[h] ?? [];
      const want = sheetColours[r.id] ?? [];
      colourNotes.push(`${r.name}: sheet ${want.join("/")} · app ${have.join("/")} ${same(have, want) ? "✔" : "✘"}`);
    }
  }
  return { checks, colourNotes };
}

/** What changed anywhere else: counts and the newest change time of the other organisations' events, divisions, heats and seats, to prove they are untouched. */
export async function fingerprint(db: SupabaseClient, exceptOrgIds: string[]): Promise<string> {
  const orgs = (await db.from("organisations").select("id, name, slug, settings, branding, updated_at").order("id")).data ?? [];
  const parts: unknown[] = [];
  for (const o of orgs.filter((x) => !exceptOrgIds.includes(x.id) && !x.slug.startsWith("e2e-"))) {
    const events = (await db.from("events").select("id, updated_at, status").eq("organisation_id", o.id).order("id")).data ?? [];
    const ids = events.map((e) => e.id);
    const divisions = ids.length ? (await db.from("divisions").select("id, updated_at").in("event_id", ids).order("id")).data ?? [] : [];
    const heats = ids.length ? (await db.from("heats").select("id, updated_at").in("event_id", ids).order("id")).data ?? [] : [];
    const seats = ids.length ? (await db.from("judge_seats").select("id, updated_at").in("event_id", ids).order("id")).data ?? [] : [];
    parts.push([o, events, divisions, heats, seats]);
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}
