import type { Page } from "@playwright/test";
import { builtInSchemes } from "../src/lib/schemas/identification";
import { createOrganiser } from "./organiser";

/**
 * A throwaway live event for the browser tests (Phase 5b): an organiser, a published event in Cairo with the Lycra-per-heat scheme, one division with the
 * Legacy Variety scoring model (single score in steps of 0.5, 7 attempts a rider, 3 judges; `model: "kota-best3-impression"` scores by criteria), a locked draw with two heats of four riders, a run order for today, and a seat with its own login for
 * three judges, a head judge and a spotter. Everything hangs off one throwaway organisation, which the ledger removes (Arrow, EKL and Demo are never touched).
 */
export type SeatKey = "j1" | "j2" | "j3" | "head" | "spotter" | "spotter2";
const SEATS: Array<[SeatKey, string, "judge" | "head" | "spotter"]> = [
  ["j1", "Judge 1", "judge"],
  ["j2", "Judge 2", "judge"],
  ["j3", "Judge 3", "judge"],
  ["head", "Head judge", "head"],
  ["spotter", "Spotter 1", "spotter"],
  ["spotter2", "Spotter 2", "spotter"],
];
const COLOURS = ["red", "blue", "yellow", "green"];
const NAMES = ["Sam Rivera", "Noor Haddad", "Lena Vogt", "Mia Costa"];

export async function createLiveWorld(opts: { headScores?: boolean; maxRunning?: number; model?: string } = {}) {
  const org = await createOrganiser();
  const db = org.db;
  const must = <T extends { id: string }>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
    return r.data;
  };
  const lycra = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

  const event = must(
    await db
      .from("events")
      .insert({
        organisation_id: org.orgId,
        name: `E2E Live ${org.run}`,
        slug: `e2e-live-${org.run}`,
        status: "published",
        timezone: "Africa/Cairo",
        start_date: today,
        end_date: today,
        settings: { publicLiveScores: "live", maxRunningHeats: opts.maxRunning ?? 1, identification: { scheme: lycra, allowDivisionOverride: false } } as never,
      })
      .select("id")
      .single(),
    "event",
  );
  const { data: model } = await db.from("scoring_models").select("id").is("organisation_id", null).eq("key", opts.model ?? "legacy-kol-best3-variety").order("version", { ascending: false }).limit(1).single();
  const panel = must(await db.from("panels").insert({ event_id: event.id, name: "Panel 1" }).select("id").single(), "panel");
  const division = must(
    await db
      .from("divisions")
      .insert({ event_id: event.id, name: "Pro Men", sort_order: 1, scoring_model_id: model!.id, scoring_overrides: { heat: { maxAttemptsPerRider: 7 } } as never, panel_id: panel.id, draw_locked_at: new Date().toISOString() })
      .select("id")
      .single(),
    "division",
  );
  const round = must(await db.from("rounds").insert({ division_id: division.id, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single(), "round");

  const entries: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [first, ...rest] = NAMES[i].split(" ");
    const rider = must(await db.from("riders").insert({ organisation_id: org.orgId, first_name: first, last_name: rest.join(" "), nationality: "EG" }).select("id").single(), "rider");
    entries.push(must(await db.from("entries").insert({ division_id: division.id, rider_id: rider.id, seed: i + 1, status: "confirmed", source: "manual" }).select("id").single(), "entry").id);
  }
  const heats: string[] = [];
  for (const n of [1, 2]) {
    const heat = must(await db.from("heats").insert({ round_id: round.id, division_id: division.id, event_id: event.id, number: n, duration_sec: 600, warm_up_sec: 0 }).select("id").single(), "heat");
    heats.push(heat.id);
    for (let p = 0; p < 4; p++) await db.from("heat_slots").insert({ heat_id: heat.id, position: p + 1, entry_id: entries[p], vest_colour: COLOURS[p] });
  }
  // today's run order: Heat 1 pinned at 10:00, Heat 2 after it
  const plan = must(
    await db
      .from("schedule_plans")
      .insert({ event_id: event.id, day: today, name: "Main", active: true, items: [{ id: "i1", kind: "heat", heatId: heats[0] }, { id: "i2", kind: "heat", heatId: heats[1] }], anchors: { i1: "10:00" } })
      .select("id")
      .single(),
    "plan",
  );

  const seats = {} as Record<SeatKey, { id: string; email: string; userId: string }>;
  const password = `Pw-${org.run}-live`;
  for (const [key, name, role] of SEATS) {
    const email = `e2e-${org.run}-${key}@example.com`;
    const { data: u, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !u.user) throw new Error(`seat login ${key}: ${error?.message}`);
    org.trackUser(u.user.id);
    const seat = must(await db.from("judge_seats").insert({ event_id: event.id, name, role, scores: role === "judge" || (role === "head" && Boolean(opts.headScores)), auth_user_id: u.user.id, status: "active", active: true }).select("id").single(), `seat ${key}`);
    seats[key] = { id: seat.id, email, userId: u.user.id };
  }
  const panelKeys: SeatKey[] = opts.headScores ? ["j1", "j2", "j3", "head"] : ["j1", "j2", "j3"];
  let n = 0;
  for (const key of panelKeys) await db.from("panel_members").insert({ panel_id: panel.id, judge_seat_id: seats[key].id, seat_no: ++n });

  return {
    org,
    db,
    eventId: event.id,
    divisionId: division.id,
    heats,
    entries,
    planId: plan.id,
    seats,
    today,
    names: NAMES,
    colours: COLOURS,
    /** Signs the page in as a seat (a real login of its own, through a one-time link) and opens `next`. */
    async signInAs(page: Page, key: SeatKey, next: string) {
      const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: seats[key].email });
      if (error) throw new Error(error.message);
      await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`);
    },
    /** The server starts the heat (service key: the same stamp the head judge's button gives). */
    async startHeat(heat: string) {
      await db.from("heats").update({ status: "running" }).eq("id", heat);
    },
    async cleanup() {
      await org.cleanup();
    },
  };
}
export type LiveWorld = Awaited<ReturnType<typeof createLiveWorld>>;
