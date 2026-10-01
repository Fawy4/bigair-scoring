import { randomUUID } from "node:crypto";
import { drawProjection } from "../src/lib/draw/projection";
import { publishLadderHeat, mkLadder, breakdownOf, type Ladder } from "../tests/rls/public-helpers";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * A throwaway public event for the browser tests (Phase 6): the live world (Pro Men: two heats of four riders with Lycra colours, three judges) plus a Knockout division
 * with a ladder (two heats of three, then a Final), one run order for today with all of them, one published heat with real boxes, one running heat with logged and
 * scored attempts, and the first Ladder heat released so its winner sits in the Final. Everything hangs off one throwaway organisation (the ledger removes it).
 */
export interface PublicWorld extends LiveWorld {
  ladder: Ladder;
  /** A second ladder whose Final is dealt from all arrivals: a released heat shows "Name · 1st H1 · seat pending". */
  reseedLadder: Ladder;
  slug: string;
  /** Pro Men heat 1 (published, with a result) and heat 2 (running, scores logged). */
  published: string;
  running: string;
}

export async function createPublicWorld(opts: { liveScores?: "live" | "after_publish"; attemptDisplay?: string; settings?: object; branding?: object } = {}): Promise<PublicWorld> {
  const w = await createLiveWorld();
  const db = w.db;
  const { data: ev } = await db.from("events").select("slug, settings").eq("id", w.eventId).single();
  await db
    .from("events")
    .update({
      status: "live",
      settings: { ...(ev!.settings as object), publicLiveScores: opts.liveScores ?? "live", publicResultsOnPublish: true, livePollSec: 3, readyCallMin: 15, ...(opts.settings ?? {}) } as never,
      ...(opts.branding ? { branding: opts.branding as never } : {}),
    })
    .eq("id", w.eventId);
  await db.from("divisions").update({ live_settings: { spectatorAttemptDisplay: opts.attemptDisplay ?? "number_score" } as never }).eq("id", w.divisionId);
  const ctx = { s: db, ids: { orgA: w.orgId, evA1: w.eventId, modelA1: w.modelId } };
  const ladder = await mkLadder(ctx, { name: "Knockout" });

  const reseedLadder = await mkLadder(ctx, { name: "Reseed", reseed: "by_heat_score" });

  // Pro Men heat 1: published, with a result (two landed, one crash, graded boxes) and Lycra colours
  const [h1, h2] = w.heats;
  const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
  await db.from("heats").update({ status: "published", started_at: ago(1500), ended_at: ago(900), published_at: ago(800), publish_hold: false }).eq("id", h1);
  const tricks: Array<Array<[string, number | null, boolean]>> = [
    [["Backroll", 7, true], ["Frontroll", 5.5, true], ["Kiteloop", 4, true], ["Megaloop", null, false]],
    [["Backroll", 4.5, true], ["Frontroll", 3, true], ["Kiteloop", 2, false]],
    [["Backroll", 3.5, true], ["Megaloop", null, false]],
    [["Frontroll", 2.5, true]],
  ];
  for (let i = 0; i < 4; i++) {
    const total = [20.5, 14, 9.5, 6][i];
    const bd = breakdownOf(total) as Record<string, unknown>;
    bd.allAttempts = tricks[i].map(([name, score, counted], n) => ({ seq: n + 1, status: score === null ? "crashed" : "landed", trickName: name, categoryKey: null, score, counted, repeatIndex: 0, priorCrashesSameTrick: 0, panel: score === null ? null : { score, judgeScores: [{ judgeId: "J1", score }] } }));
    bd.totalLabel = total.toFixed(1);
    bd.total = total;
    await db.from("heat_results").insert({ event_id: w.eventId, heat_id: h1, entry_id: w.entries[i], place: i + 1, total, percent: 50, breakdown: bd as never, version: 1 });
  }

  // Pro Men heat 2: running for two minutes, attempts logged and scored by all three judges
  await db.from("heats").update({ status: "running", started_at: ago(120) }).eq("id", h2);
  const judgeSeats = [w.seats.j1.id, w.seats.j2.id, w.seats.j3.id];
  const live: Array<[number, string, "landed" | "crashed", number | null]> = [[0, "Backroll", "landed", 6], [0, "Megaloop", "crashed", null], [1, "Frontroll", "landed", 4.5], [2, "Kiteloop", "landed", 3]];
  const seq = [0, 0, 0, 0];
  for (const [rider, trick, status, score] of live) {
    seq[rider] += 1;
    const { data: a } = await db.from("trick_attempts").insert({ heat_id: h2, entry_id: w.entries[rider], seq: seq[rider], status, trick_name: trick, client_key: randomUUID() }).select("id").single();
    if (score !== null) {
      for (const seat of judgeSeats) {
        const { error } = await db.from("trick_scores").insert({ attempt_id: a!.id, heat_id: h2, event_id: w.eventId, judge_seat_id: seat, score, client_key: randomUUID() });
        if (error) throw new Error(`score: ${error.message}`);
      }
    }
  }

  // the Knockout ladder: Round 1 heat 1 released, so its winner sits in the Final
  await publishLadderHeat(ctx, ladder, "R1-H1");
  await publishLadderHeat(ctx, reseedLadder, "R1-H1");

  // today's run order holds every heat (Pro Men first, then the ladder)
  const items = [...w.heats, ...Object.values(ladder.heats), ...Object.values(reseedLadder.heats)].map((id, i) => ({ id: `i${i + 1}`, kind: "heat", heatId: id }));
  await db.from("schedule_plans").update({ items: items as never, anchors: { i1: "10:00" }, defaults: { breakAfterHeatMin: 2, breakAfterRoundMin: 3 } as never }).eq("id", w.planId);
  void drawProjection;
  return Object.assign(w, { ladder, reseedLadder, slug: ev!.slug as string, published: h1, running: h2 });
}
