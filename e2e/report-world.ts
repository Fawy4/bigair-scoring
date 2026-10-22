import { randomUUID } from "node:crypto";
import { mkLadder, publishLadderHeat, type Ladder } from "../tests/rls/public-helpers";
import { createOrganiser } from "./organiser";

/**
 * A throwaway event for the rider report (RA1): made-up riders only. A Knockout division of six (two heats of three, then a Final of two) whose heats are published with
 * real-looking results: trick names, sides, times, panel scores, and the individual judges' scores inside the stored breakdown (the report must never show them). The
 * event is public ("live") and its division shows numbers only, to prove the report shows trick names anyway. One rider (the last) is under 18.
 */
export interface ReportWorld {
  db: Awaited<ReturnType<typeof createOrganiser>>["db"];
  org: Awaited<ReturnType<typeof createOrganiser>>;
  orgId: string;
  eventId: string;
  slug: string;
  ladder: Ladder;
  /** Riders by name, for the tests. */
  entry: (name: string) => string;
  minor: string;
  setting: (value: "off" | "after_heat" | "after_event", status?: string) => Promise<void>;
  cleanup: () => Promise<void>;
}

interface TrickDef {
  name: string;
  parts: { items: Array<{ id: string; multiplier?: string }> };
  category: string;
  base: number;
}
const TRICKS: TrickDef[] = [
  { name: "Backroll", parts: { items: [{ id: "base:backroll" }] }, category: "rotation", base: 3.4 },
  { name: "Frontroll", parts: { items: [{ id: "base:frontroll" }] }, category: "rotation", base: 3.6 },
  { name: "Kiteloop", parts: { items: [{ id: "base:kiteloop" }] }, category: "kiteloop", base: 4.8 },
  { name: "Megaloop", parts: { items: [{ id: "base:megaloop" }] }, category: "kiteloop", base: 6.1 },
  { name: "×2 Backroll Board-off", parts: { items: [{ id: "base:backroll", multiplier: "x2" }, { id: "addon:board_off" }] }, category: "board_off", base: 5.4 },
  { name: "Straight dangle pass", parts: { items: [{ id: "base:straight_dangle_pass" }] }, category: "unhooked", base: 5.0 },
  { name: "Backroll Board-off", parts: { items: [{ id: "base:backroll" }, { id: "addon:board_off" }] }, category: "board_off", base: 4.2 },
];

let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

interface Script {
  attempts: Array<{ seq: number; status: "landed" | "crashed"; side: "left" | "right"; at: number; trick: TrickDef; score: number | null; counted: boolean }>;
  impression: number;
  total: number;
  tricks: number;
}

/** A rider's heat: 5 to 8 attempts, the quality of the rider decides how many land; the best three landed scores count. */
function script(quality: number, length: number): Script {
  const n = 5 + Math.floor(rand() * 4);
  const attempts = Array.from({ length: n }, (_, i) => {
    const trick = TRICKS[Math.floor(rand() * TRICKS.length)];
    const landed = rand() < quality;
    return { seq: i + 1, status: landed ? ("landed" as const) : ("crashed" as const), side: rand() < 0.6 ? ("left" as const) : ("right" as const), at: Math.round(((i + 0.5) / n) * length * (0.9 + rand() * 0.1)), trick, score: landed ? Math.round((trick.base + (rand() - 0.5) * 1.6) * 10) / 10 : null, counted: false };
  });
  const top = attempts.filter((a) => a.score !== null).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 3);
  for (const t of top) t.counted = true;
  const tricks = Math.round(top.reduce((s, t) => s + (t.score as number), 0) * 100) / 100;
  const impression = Math.round((3 + quality * 4 + rand()) * 100) / 100;
  return { attempts, impression, tricks, total: Math.round((tricks + impression) * 100) / 100 };
}

export async function createReportWorld(opts: { impressionName?: string; setting?: "off" | "after_heat" | "after_event"; sides?: boolean } = {}): Promise<ReportWorld> {
  seed = 7;
  const org = await createOrganiser();
  const db = org.db;
  const must = <T extends { id: string }>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message}`);
    return r.data;
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  const event = must(
    await db
      .from("events")
      .insert({
        organisation_id: org.orgId,
        name: `Report sample ${org.run}`,
        slug: `e2e-report-${org.run}`,
        status: "live",
        timezone: "Africa/Cairo",
        start_date: today,
        end_date: today,
        settings: { publicLiveScores: "after_publish", publicResultsOnPublish: true, livePollSec: 3, impressionName: opts.impressionName ?? "Impression", riderReports: opts.setting ?? "after_heat" } as never,
      })
      .select("id")
      .single(),
    "event",
  );
  const { data: model } = await db.from("scoring_models").select("id").is("organisation_id", null).eq("key", "winds-of-sinai").order("version", { ascending: false }).limit(1).single();
  const ctx = { s: db, ids: { orgA: org.orgId, evA1: event.id, modelA1: model!.id } };
  const ladder = await mkLadder(ctx, { name: "Pro", model: model!.id, live: { spectatorAttemptDisplay: "number_score" } });
  await db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 8 } } as never }).eq("id", ladder.div);

  const nameOf = (id: string) => ladder.names[ladder.entries.indexOf(id)];
  const quality: Record<string, number> = { Ana: 0.85, Ben: 0.7, Cy: 0.55, Di: 0.8, Eli: 0.6, Flo: 0.5 };
  const richen = async (uid: string) => {
    const heatId = ladder.heats[uid];
    const started = new Date(Date.now() - 4000 * 1000);
    const length = 600;
    await db.from("heats").update({ started_at: started.toISOString(), ended_at: new Date(started.getTime() + length * 1000).toISOString(), duration_sec: length }).eq("id", heatId);
    const { data: results } = await db.from("heat_results").select("event_id, entry_id, place, total, percent").eq("heat_id", heatId).eq("version", 1).order("place");
    const rows = results ?? [];
    // scripts in rank order: the best script goes to the rider the draw already ranked first
    const scripts = rows.map((r) => script(quality[nameOf(r.entry_id).split(" ")[0]] ?? 0.6, length)).sort((a, b) => b.total - a.total);
    const out = [];
    for (const [i, r] of rows.entries()) {
      const s = scripts[i];
      const breakdown = {
        status: "ok",
        total: s.total,
        totalLabel: s.total.toFixed(2),
        components: { tricks: s.tricks, impression: s.impression, bonus: 0, penalty: 0 },
        counted: s.attempts.filter((a) => a.counted).map((a) => ({ attemptSeq: a.seq, score: a.score, categoryKey: a.trick.category })),
        allAttempts: s.attempts.map((a) => ({
          seq: a.seq,
          status: a.status,
          trickName: a.status === "landed" ? a.trick.name : null,
          categoryKey: a.trick.category,
          score: a.score,
          counted: a.counted,
          repeatIndex: 0,
          priorCrashesSameTrick: 0,
          panel: a.score === null ? null : { score: a.score, unrounded: a.score, judgeScores: [{ judgeId: "J1", score: 9.9 }, { judgeId: "J2", score: 1.1 }], incomplete: false, missing: [], missedBy: ["J2"], outlier: true },
        })),
        impression: { score: s.impression, unrounded: s.impression, judgeScores: [{ judgeId: "J1", score: 9.8 }], incomplete: false, missing: [], missedBy: [], outlier: false },
        landedCount: s.attempts.filter((a) => a.status === "landed").length,
        attemptCount: s.attempts.length,
        attemptCap: 8,
        modifiers: [],
        flags: { incomplete: false, outliers: [1], extraAttemptsIgnored: false, sensorMissing: [], uncategorised: [] },
      };
      out.push({ event_id: r.event_id, entry_id: r.entry_id, heat_id: heatId, place: r.place, total: s.total, percent: r.percent, breakdown, version: 2 });
      for (const a of s.attempts) {
        const { error } = await db.from("trick_attempts").insert({
          event_id: event.id,
          heat_id: heatId,
          entry_id: r.entry_id,
          seq: a.seq,
          status: a.status,
          direction: a.side,
          trick_name: `${a.side === "left" ? "IN" : "OUT"} ${a.trick.name}`,
          trick_parts: { direction: a.side, items: a.trick.parts.items } as never,
          category_key: a.trick.category,
          raw_text: a.trick.name,
          input_method: "text",
          client_key: randomUUID(),
          created_at: new Date(started.getTime() + a.at * 1000).toISOString(),
        });
        if (error) throw new Error(`attempt: ${error.message}`);
      }
    }
    // results are append-only: the rich version is the heat's second version, the one a visitor reads (and the total the draw already used keeps its place)
    const { error } = await db.from("heat_results").insert(out as never);
    if (error) throw new Error(`results: ${error.message}`);
  };
  let draw = ladder.draw;
  for (const uid of ["R1-H1", "R1-H2"]) {
    ({ draw } = await publishLadderHeat(ctx, ladder, uid, { draw }));
    await richen(uid);
  }
  // the Final: its two riders are now seated by the published Round 1 heats
  const final = Object.keys(ladder.heats).find((u) => !u.startsWith("R1"))!;
  await publishLadderHeat(ctx, ladder, final, { draw });
  await richen(final);

  const minor = ladder.entries[5];
  const { data: ent } = await db.from("entries").select("rider_id").eq("id", minor).single();
  await db.from("riders").update({ dob: `${new Date().getFullYear() - 15}-06-01` }).eq("id", ent!.rider_id);

  return {
    db,
    org,
    orgId: org.orgId,
    eventId: event.id,
    slug: `e2e-report-${org.run}`,
    ladder,
    entry: (name: string) => ladder.entries[ladder.names.findIndex((n) => n.startsWith(name))],
    minor,
    async setting(value, status) {
      const { data } = await db.from("events").select("settings").eq("id", event.id).single();
      await db.from("events").update({ settings: { ...(data!.settings as object), riderReports: value } as never, ...(status ? { status } : {}) }).eq("id", event.id);
    },
    cleanup: () => org.cleanup(),
  };
}
